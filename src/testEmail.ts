import 'dotenv/config';
import { sendEmail } from './services/email.service.js';
async function main() {
  try {
    const result = await sendEmail({
      to: 'r0548547387@gmail.com',
      subject: 'בדיקת שליחה מ-Wolf System',
      html: '<h2>שלום 👋</h2><p>בדיקת מערכת המיילים.</p>',
      text: 'שלום, זו בדיקת מערכת המיילים.',
    });

    console.log('✅ נשלח בהצלחה!', result);
  } catch (err) {
    console.error('❌ שגיאה בשליחה:', err);
  }
}

main();
