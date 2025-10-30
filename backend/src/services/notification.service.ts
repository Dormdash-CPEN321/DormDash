import admin from '../config/firebase';
import { NotificationPayload } from '../types/notification.types';
import logger from '../utils/logger.util';
import mongoose from 'mongoose';
import { JobStatus, JobType } from '../types/job.type';
import { jobModel } from '../models/job.model';
import { userModel } from '../models/user.model';
import { FirebaseMessagingError } from 'firebase-admin/messaging';
``;

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
        `Error sending notification to ${payload.fcmToken}: ${error}`
      );
      if (
        (error as FirebaseMessagingError).code ===
          'messaging/registration-token-not-registered' ||
        (error as FirebaseMessagingError).code === 'messaging/invalid-argument'
      ) {
        logger.warn(
          `Token ${payload.fcmToken} is invalid or expired, clearing from database`
        );
        // Clear invalid token from the database
        try {
          await userModel.clearInvalidFcmToken(payload.fcmToken);
          logger.info(`Cleared invalid FCM token from database`);
        } catch (clearError) {
          logger.error(`Failed to clear invalid FCM token: ${clearError}`);
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
        logger.warn(`Job not found for id ${jobId}`);
        return;
      }

      const student = job.studentId as any;
      if (!student?.fcmToken) {
        logger.warn(`No FCM token found for student ${student._id}`);
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
        fcmToken: student.fcmToken,
        title,
        body,
        data: {
          jobId: job._id.toString(),
          status,
        },
      };

      await this.sendNotificationToDevice(notification);
      logger.info(
        `Notification sent to student ${student._id.toString()} for job ${job._id.toString()} with status ${status}`
      );
    } catch (error: any) {
      logger.error('Failed to send job status notification:', error);
    }
  }

  // debug notification function to test FCM, call it from controllers or services
  async sendDebugNotification(studentId: mongoose.Types.ObjectId) {
    const token = await userModel.getFcmToken(studentId);
    if (!token) {
      logger.warn(`No FCM token found for student ${String(studentId)}`);
      return;
    } else {
      // Avoid logging raw FCM tokens (sensitive). Log presence only.
      logger.info(`Found FCM token for student ${String(studentId)}`);
    }
    const notification: NotificationPayload = {
      fcmToken: token,
      title: 'Debug Notification',
      body: 'This is a test notification from NotificationService.',
      data: {
        debug: 'true',
      },
    };
    await this.sendNotificationToDevice(notification);
  }
}

export const notificationService = new NotificationService();
