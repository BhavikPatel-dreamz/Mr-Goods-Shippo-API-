import axios from "axios";

export async function sendBrevoEmail(toEmail, subject, htmlContent) {
  try {
    const res = await axios.post(
      "https://api.brevo.com/v3/smtp/email",
      {
        sender: {
          email: process.env.EMAIL_SENDER,
          name: process.env.EMAIL_SENDER_NAME,
        },
        to: [{ email: toEmail }],
        subject,
        htmlContent,
      },
      {
        headers: {
          "api-key": process.env.BREVO_API_KEY,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
      }
    );

    console.log("BREVO RESPONSE:", res.data);
    return res.data;
  } catch (err) {
    console.error(
      "BREVO ERROR:",
      err.response?.data || err.message
    );
    throw err;
  }
}
