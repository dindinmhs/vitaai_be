import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.get('JWT_SECRET') || 'super',
    });
  }

  async validate(payload: {
    sub: string;
    email: string;
    role: string;
    iat: number;
    exp: number;
  }) {
    const user = await this.prisma.user.findUnique({
      where: {
        id: payload.sub,
      },
    });

    if (!user || !user.verifiedAt) return null;

    return user;
  }
}
