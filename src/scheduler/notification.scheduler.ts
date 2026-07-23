import cron from 'node-cron';
import notificationService from '../services/notification.service';
import logger from '../utils/logger';

class NotificationScheduler {
  public start() {
    // 06:50 WIB - 10 Minute Reminder
    cron.schedule('50 06 * * *', async () => {
      logger.info('[SCHEDULER] Running morning 10 minute auto cleaning reminder at 06:50');
      await notificationService.sendReminder10Minutes();
    }, {
      timezone: 'Asia/Jakarta'
    });

    // 06:55 WIB - 5 Minute Warning
    cron.schedule('55 06 * * *', async () => {
      logger.info('[SCHEDULER] Running morning 5 minute auto cleaning warning at 06:55');
      await notificationService.sendReminder5Minutes();
    }, {
      timezone: 'Asia/Jakarta'
    });

    // 17:50 WIB - 10 Minute Reminder
    cron.schedule('50 17 * * *', async () => {
      logger.info('[SCHEDULER] Running evening 10 minute auto cleaning reminder at 17:50');
      await notificationService.sendReminder10Minutes();
    }, {
      timezone: 'Asia/Jakarta'
    });

    // 17:55 WIB - 5 Minute Warning
    cron.schedule('55 17 * * *', async () => {
      logger.info('[SCHEDULER] Running evening 5 minute auto cleaning warning at 17:55');
      await notificationService.sendReminder5Minutes();
    }, {
      timezone: 'Asia/Jakarta'
    });

    logger.info('[SCHEDULER] Notification schedules initialized.');
  }
}

export default new NotificationScheduler();
