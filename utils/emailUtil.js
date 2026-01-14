import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
dotenv.config();

// Create transporter logic
const createTransporter = async () => {
    // 1. Check for Generic SMTP (Mailtrap, SendGrid, etc.)
    if (process.env.EMAIL_HOST) {
        return nodemailer.createTransport({
            host: process.env.EMAIL_HOST,
            port: process.env.EMAIL_PORT || 587,
            secure: process.env.EMAIL_SECURE === 'true', // true for 465, false for 587
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS,
            },
        });
    }

    // 2. Fallback to Gmail if service is specified
    if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
        return nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS,
            },
        });
    }

    // Otherwise, generate a test account for Ethereal
    console.log("Creating Ethereal test account for local email debugging...");
    const testAccount = await nodemailer.createTestAccount();
    return nodemailer.createTransport({
        host: "smtp.ethereal.email",
        port: 587,
        secure: false, // true for 465, false for other ports
        auth: {
            user: testAccount.user,
            pass: testAccount.pass,
        },
    });
};

/**
 * Send an invitation email to a guest user
 * @param {string} email - Recipient email
 * @param {string} token - Invitation token
 * @param {string} initiatorName - Name of the person inviting
 */
export const sendInvitationEmail = async (email, token, initiatorName = "A friend") => {
    const inviteLink = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/signup?invite=${token}&email=${encodeURIComponent(email)}`;

    const mailOptions = {
        from: `"PlayLink" <no-reply@playlink.com>`,
        to: email,
        subject: `${initiatorName} invited you to join a game on PlayLink!`,
        html: `
      <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #eee; padding: 20px; border-radius: 10px;">
        <h2 style="color: #22c55e;">You've been invited!</h2>
        <p><strong>${initiatorName}</strong> has invited you to split a payment for a booking on PlayLink.</p>
        <p>Click the link below to create an account and join the booking:</p>
        <p style="text-align: center; margin: 30px 0;">
          <a href="${inviteLink}" style="background-color: #22c55e; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">Accept Invitation</a>
        </p>
        <p style="font-size: 12px; color: #666;">Or copy this link: <br> ${inviteLink}</p>
      </div>
    `,
    };

    try {
        const transporter = await createTransporter();
        const info = await transporter.sendMail(mailOptions);

        console.log(`Invitation email sent to ${email}`);

        // If using Ethereal, log a preview URL
        if (nodemailer.getTestMessageUrl(info)) {
            console.log("---------------------------------------");
            console.log("PREVIEW EMAIL LOCALLY:");
            console.log(nodemailer.getTestMessageUrl(info));
            console.log("---------------------------------------");
        }
    } catch (error) {
        console.error("Error sending email:", error);
    }
};
