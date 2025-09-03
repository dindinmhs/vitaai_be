import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ChangePasswordDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  SigninDto,
  SignupDto,
} from './dto';
import * as argon from 'argon2';
import { PrismaService } from 'src/prisma/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { MailerService } from '@nestjs-modules/mailer';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private readonly mailer: MailerService,
  ) {}

  async signup(dto: SignupDto) {
    // hash password
    const hash = await argon.hash(dto.password);
    // save db
    try {
      const user = await this.prisma.user.create({
        data: {
          email: dto.email,
          name: dto.name,
          hash,
        },
      });

      // Generate verification token
      const verificationToken = await this.signToken(
        user.id,
        user.email,
        user.role,
        '24h',
      );

      // Create verification URL
      const verificationUrl = `${process.env.FRONTEND_URL}/verify?token=${verificationToken.accessToken}`;

      await this.mailer.sendMail({
        from: 'wastehub66@gmail.com',
        to: user?.email,
        subject: 'Verifikasi Email Akun Anda',
        html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Verifikasi Email</h2>
          <p>Halo ${user.name},</p>
          <p>Terima kasih telah mendaftar. Silakan klik tombol di bawah untuk memverifikasi email Anda:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${verificationUrl}" 
               style="background-color: #4CAF50; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
              Verifikasi Email
            </a>
          </div>
          <p>Link ini akan kedaluwarsa dalam 24 jam.</p>
          <p>Jika Anda tidak membuat akun ini, abaikan email ini.</p>
        </div>
      `,
      });

      return {
        message: 'Akun berhasil dibuat, Silakan cek email untuk verifikasi',
      };
    } catch (error) {
      if (error instanceof PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ForbiddenException('Credentials taken');
        }
      }
      throw error;
    }
  }

  async signin(dto: SigninDto) {
    let pwMatches;
    const user = await this.prisma.user.findUnique({
      where: {
        email: dto.email,
      },
    });

    if (user) pwMatches = await argon.verify(user.hash, dto.password);

    if (!user || !pwMatches)
      throw new ForbiddenException('Email atau password salah');

    return this.signToken(user.id, user.email, user.role, '60m');
  }

  async changePassword(
    userId: string,
    userHash: string,
    passwordDto: ChangePasswordDto,
  ) {
    const pwMatches = await argon.verify(userHash, passwordDto.oldPassword);

    if (!pwMatches) throw new ForbiddenException('Password salah');

    const hash = await argon.hash(passwordDto.lastPassword);

    await this.prisma.user.update({
      where: {
        id: userId,
      },
      data: {
        hash,
      },
    });

    return { massage: 'Password berhasil direset' };
  }

  async signToken(
    userId: string,
    email: string,
    userRole: string,
    expire: string,
  ) {
    const payload = { sub: userId, email: email };

    const accessToken = await this.jwt.signAsync(payload, {
      expiresIn: expire,
    });

    return { accessToken, userId, email, userRole };
  }

  async verifyEmail(token: string) {
    try {
      // Verify and decode the JWT token
      const decoded = await this.jwt.verifyAsync(token);
      const userId = decoded.sub;

      const user = await this.prisma.user.findUnique({
        where: {
          id: userId,
        },
      });

      if (!user) {
        throw new NotFoundException('User tidak ditemukan');
      }

      if (user.verifiedAt) {
        throw new ForbiddenException('Email sudah terverifikasi');
      }

      await this.prisma.user.update({
        where: {
          id: userId,
        },
        data: {
          verifiedAt: new Date(),
        },
      });

      return { message: 'Email berhasil diverifikasi' };
    } catch (error) {
      if (
        error.name === 'JsonWebTokenError' ||
        error.name === 'TokenExpiredError'
      ) {
        throw new UnauthorizedException(
          'Token verifikasi tidak valid atau sudah kedaluwarsa',
        );
      }
      throw error;
    }
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: {
        email: dto.email,
      },
    });

    // Tidak memberitahu jika email tidak ditemukan untuk keamanan
    if (!user) {
      return {
        message: 'Jika email terdaftar, link reset password telah dikirim',
      };
    }

    // Generate reset token dengan expiry 1 jam
    const resetToken = await this.signToken(
      user.id,
      user.email,
      user.role,
      '1h',
    );

    // Create reset URL
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken.accessToken}`;

    try {
      await this.mailer.sendMail({
        from: 'wastehub66@gmail.com',
        to: user.email,
        subject: 'Reset Password Akun Anda',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>Reset Password</h2>
            <p>Halo ${user.name},</p>
            <p>Anda telah meminta untuk reset password. Silakan klik tombol di bawah untuk mengatur password baru:</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetUrl}" 
                 style="background-color: #FF6B6B; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
                Reset Password
              </a>
            </div>
            <p>Link ini akan kedaluwarsa dalam 1 jam.</p>
            <p>Jika Anda tidak meminta reset password, abaikan email ini.</p>
            <p style="color: #666; font-size: 12px;">
              Atau copy dan paste link berikut: ${resetUrl}
            </p>
          </div>
        `,
      });
    } catch (error) {
      throw new BadRequestException('Gagal mengirim email reset password');
    }

    return {
      message: 'Jika email terdaftar, link reset password telah dikirim',
    };
  }

  async resetPassword(dto: ResetPasswordDto) {
    try {
      // Verify dan decode JWT token
      const decoded = await this.jwt.verifyAsync(dto.token);
      const userId = decoded.sub;

      const user = await this.prisma.user.findUnique({
        where: {
          id: userId,
        },
      });

      if (!user) {
        throw new NotFoundException('User tidak ditemukan');
      }

      // Hash password baru
      const newHash = await argon.hash(dto.newPassword);

      // Update password di database
      await this.prisma.user.update({
        where: {
          id: userId,
        },
        data: {
          hash: newHash,
          // Optional: update timestamp untuk tracking
          updatedAt: new Date(),
        },
      });

      return { message: 'Password berhasil direset' };
    } catch (error) {
      if (
        error.name === 'JsonWebTokenError' ||
        error.name === 'TokenExpiredError'
      ) {
        throw new UnauthorizedException(
          'Token reset password tidak valid atau sudah kedaluwarsa',
        );
      }
      throw error;
    }
  }
}
