export interface NotificationPayload {
  fcmToken: string;
  title: string;
  body: string;
  data?: Record<string, string>; // Optional custom data
}
