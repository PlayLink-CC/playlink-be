import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
dotenv.config();

// Create reusable transporter object using the default SMTP transport
const transporter = nodemailer.createTransport({
    service: 'gmail', // or configured host/port from env
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

/**
 * Send an invitation email to a guest user
 * @param {string} email - Recipient email
 * @param {string} token - Invitation token
 * @param {string} initiatorName - Name of the person inviting
 */
export const sendInvitationEmail = async (email, token, initiatorName = "A friend") => {
    const inviteLink = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/register?invite=${token}&email=${encodeURIComponent(email)}`;

    const mailOptions = {
        from: `"PlayLink" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: `${initiatorName} invited you to join a game on PlayLink!`,
        html: `
      <div style="font-family: Arial, sans-serif; color: #333;">
        <h2>You've been invited!</h2>
        <p><strong>${initiatorName}</strong> has invited you to split a payment for a booking on PlayLink.</p>
        <p>Click the link below to create an account and join the booking:</p>
        <p>
          <a href="${inviteLink}" style="background-color: #22c55e; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Accept Invitation</a>
        </p>
        <p>Or copy this link: <br> ${inviteLink}</p>
      </div>
    `,
    };

    try {
        if (!process.env.EMAIL_USER) {
            console.warn("Skipping email send: EMAIL_USER not defined in environment variables.");
            console.log(`[Mock Email] To: ${email}, Link: ${inviteLink}`);
            return;
        }
        await transporter.sendMail(mailOptions);
        console.log(`Invitation email sent to ${email}`);
    } catch (error) {
        console.error("Error sending email:", error);
        // Don't throw, just log. We don't want to break the whole flow if email fails (maybe?)
        // But ideally we should know. For now, log.
    }
};
