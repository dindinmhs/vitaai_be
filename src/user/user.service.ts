import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { UpdateProfileDto } from './dto';
import { v4 as uuid } from 'uuid';

@Injectable()
export class UserService {
  private s3Client: S3Client;
  private bucketName: string;

  constructor(private prisma: PrismaService) {
    this.s3Client = new S3Client({
      region: process.env.AWS_REGION || '',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
      },
    });
    this.bucketName = process.env.AWS_S3_BUCKET_NAME || '';
  }

  async updateProfile(
    userId: string,
    dto: UpdateProfileDto,
    file?: Express.Multer.File,
  ) {
    try {
      // Get current user data
      const currentUser = await this.prisma.user.findUnique({
        where: { id: userId },
      });

      if (!currentUser) {
        throw new BadRequestException('User not found');
      }

      let imageUrl = currentUser.imgUrl;

      // Handle image upload if file is provided
      if (file) {
        // Delete old image if exists
        if (currentUser.imgUrl) {
          await this.deleteImageFromS3(currentUser.imgUrl);
        }

        // Upload new image
        imageUrl = await this.uploadImageToS3(file, userId);
      }

      // Prepare update data
      const updateData: any = {};

      if (dto.name) {
        updateData.name = dto.name;
      }

      if (imageUrl !== currentUser.imgUrl) {
        updateData.imgUrl = imageUrl;
      }

      // Only update if there's something to update
      if (Object.keys(updateData).length === 0) {
        throw new BadRequestException('No data to update');
      }

      // Update user in database
      const updatedUser = await this.prisma.user.update({
        where: { id: userId },
        data: updateData,
        select: {
          id: true,
          name: true,
          email: true,
          imgUrl: true,
          role: true,
          verifiedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      return {
        message: 'Profile updated successfully',
        user: updatedUser,
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Failed to update profile');
    }
  }

  private async uploadImageToS3(
    file: Express.Multer.File,
    userId: string,
  ): Promise<string> {
    try {
      const fileExtension = file.originalname.split('.').pop();
      const fileName = `profile-images/${userId}/${uuid()}.${fileExtension}`;

      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: fileName,
        Body: file.buffer,
        ContentType: file.mimetype,
        ACL: 'public-read',
      });

      await this.s3Client.send(command);

      return `https://${this.bucketName}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`;
    } catch (error) {
      throw new BadRequestException('Failed to upload image to S3');
    }
  }

  private async deleteImageFromS3(imageUrl: string): Promise<void> {
    try {
      // Extract key from URL
      const urlParts = imageUrl.split('/');
      const key = urlParts.slice(-3).join('/'); // profile-images/userId/filename

      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      await this.s3Client.send(command);
    } catch (error) {
      // Log error but don't throw - old image deletion failure shouldn't stop profile update
      console.error('Failed to delete old image from S3:', error);
    }
  }
}
