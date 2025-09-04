import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';
import { MailerModule } from '@nestjs-modules/mailer';
import { S3Module } from 'nestjs-s3';
import { UserModule } from './user/user.module';
import { MedicalentryModule } from './medicalentry/medicalentry.module';

@Module({
  imports: [
    AuthModule,
    PrismaModule,
    ConfigModule.forRoot({
      envFilePath: '.env',
      isGlobal: true,
    }),
    MailerModule.forRoot({
      transport: {
        host: process.env.EMAIL_HOST,
        auth: {
          user: process.env.EMAIL_USERNAME,
          pass: process.env.EMAIL_PASSWORD,
        },
      },
    }),
    S3Module.forRoot({
      config: {
        credentials: {
          accessKeyId: 'minio',
          secretAccessKey: 'password',
        },
        // region: 'us-east-1',
        endpoint: 'http://127.0.0.1:9000',
        forcePathStyle: true,
      },
    }),
    UserModule,
    MedicalentryModule,
  ],
})
export class AppModule {}
