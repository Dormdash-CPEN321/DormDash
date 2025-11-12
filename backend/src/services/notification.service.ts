import admin from '../config/firebase';
import { NotificationPayload } from '../types/notification.types';
import logger from '../utils/logger.util';
import mongoose from 'mongoose';
import { JobStatus, JobType } from '../types/job.type';
import { jobModel } from '../models/job.model';
import { userModel } from '../models/user.model';

class NotificationService {
  async sendNotificationToDevice(payload: NotificationPayload) {
    const message: admin.messaging.Message = {
      token: payload.fcmToken,
      notification: {
        title: payload.title,
        body: payload.body,
      },
      data: payload.data,
    };

    try {
      const response = await admin.messaging().send(message);
      logger.info(`Successfully sent notification: ${response}`);
    } catch (error: unknown) {
      logger.error(
        `Error sending notification to ${payload.fcmToken}: ${String(error)}`
      );
      // Safely extract a `code` property if present on the caught error. Avoid `any` and
      // avoid casting to FirebaseMessagingError directly because caught values can be anything.
      const code =
        typeof error === 'object' && error !== null && 'code' in error
          ? (error as { code?: string }).code
          : undefined;
      if (
        code === 'messaging/registration-token-not-registered' ||
        code === 'messaging/invalid-argument'
      ) {
        logger.warn(
          `Token ${payload.fcmToken} is invalid or expired, clearing from database`
        );
        // Clear invalid token from the database
        try {
          await userModel.clearInvalidFcmToken(payload.fcmToken);
          logger.info(`Cleared invalid FCM token from database`);
        } catch (clearError: unknown) {
          logger.error(`Failed to clear invalid FCM token: ${String(clearError)}`);
        }
      }
    }
  }

  // TODO: figure out where to call this function
  // sends job status update notifications to student
  async sendJobStatusNotification(
    jobId: mongoose.Types.ObjectId,
    status:
      | JobStatus.ACCEPTED
      | JobStatus.AWAITING_STUDENT_CONFIRMATION
      | JobStatus.COMPLETED
      | JobStatus.PICKED_UP
  ) {
    try {
      const job = await jobModel.findById(jobId);
      if (!job) {
        logger.warn(`Job not found for id ${jobId.toString()}`);
        return;
      }

      // Normalize: always load the user record to obtain the current FCM token.
      // This avoids relying on whether the job document was populated or not and
      // keeps runtime behavior deterministic.
      const studentDoc = await userModel.findById(job.studentId);
      const studentFcmToken = studentDoc?.fcmToken;
      const studentIdStr = studentDoc?._id ? String(studentDoc._id) : String(job.studentId);

      if (!studentFcmToken) {
        logger.warn(`No FCM token found for student ${studentIdStr || 'unknown'}`);
        return;
      }

      let title = '';
      let body = '';

      switch (status) {
        case JobStatus.PICKED_UP:
          title = 'Job Update';
          body = 'Your mover has picked up your items!';
          break;
        case JobStatus.ACCEPTED:
          title = 'Job Accepted';
          body = 'A mover has accepted your job!';
          break;
        case JobStatus.AWAITING_STUDENT_CONFIRMATION:
          title = 'Your mover is here!';
          body = 'Please meet your mover to begin the pickup.';
          break;
        case JobStatus.COMPLETED:
          title = 'Delivery Update';
          if (job.jobType == JobType.STORAGE) {
            body = 'Your items have been moved to storage!';
          } else {
            body = 'Your items have been returned to your address.';
          }
          break;
      }

      const notification: NotificationPayload = {
        fcmToken: studentFcmToken,
        title,
        body,
        data: {
          jobId: job._id.toString(),
          status,
        },
      };

      await this.sendNotificationToDevice(notification);
      logger.info(
        `Notification sent to student ${studentIdStr || 'unknown'} for job ${job._id.toString()} with status ${status}`
      );
    } catch (error: unknown) {
      logger.error('Failed to send job status notification:', String(error));
    }
  }
}

export const notificationService = new NotificationService();
