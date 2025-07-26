const express = require("express");
const router = express.Router();
const nodemailer = require("nodemailer");
const path = require("path");
const ejs = require("ejs");
require("dotenv").config();
const Notification = require("../../models/Notification");
const Session = require("../../models/Session");


// Extract sendNotification function for reusability
async function sendNotification(sessionId) {
    if (!sessionId) {
      return res.status(400).json({ message: "sessionId is required." });
    }

    // Fetch session details
    const session = await Session.findById(sessionId)
      .populate({ path: "studentID", model: "User" })
      .populate({ path: "tutorID", model: "User" });

    if (!session)
      return res.status(404).json({ message: "Session not found." });

    const status = session.status;
    let message = "";

    // Customize the message based on session status
    switch (status) {
      case "Scheduled":
        message = `Your session has been scheduled on ${(new Date(session.sessionTime)).toLocaleString()}.`;
        break;
      case "Completed":
        message = `Your session completed. Notes: ${session.notes || "N/A"}`;
        break;
      case "Cancelled":
        message = `Your session for ${(new Date(session.sessionTime)).toLocaleString()} was cancelled.`;
        break;
      default:
        message = `Session update.`;
    }

    // Store notification in the database
    await Notification.create({
      userId: session.studentID.id,
      message,
      sessionId, // REQUIRED
    });

    await Notification.create({
      userId: session.tutorID.id,
      message,
      sessionId, // REQUIRED
    });

    // Send Email Notification
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_SERVER,
      port: process.env.SMTP_PORT,
      auth: {
        user: process.env.SMTP_USERNAME,
        pass: process.env.SMTP_PASSWORD,
      },
    });

    const subject = `Session ${status} - Tutor Tech`;

    const templatePath = path.join(__dirname, "views", "email-template.ejs");

    const recipients = [session.studentID, session.tutorID];

    for (const user of recipients) {
      const htmlContent = await ejs.renderFile(templatePath, {
        name: `${user.firstName} ${user.lastName}`,
        isTutor: user.id === session.tutorID.id,
        session,
        message,
        subject,
      });

      const mailOptions = {
        from: process.env.SMTP_USERNAME,
        replyTo: process.env.SMTP_PROXY_EMAIL,
        to: user.email,
        subject,
        html: htmlContent,
      };

      await transporter.sendMail(mailOptions);
    }
  }

router.post("/send-notification", async (req, res) => {
  try {
    const { sessionId } = req.body;

    //extracted logic into a function
    await sendNotification(sessionId);
   
    return res
      .status(200)
      .json({
        message:
          "Notifications created & emails sent to both student and tutor",
      });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// Get Notifications for a User
router.get("/:userId", async (req, res) => {
  try {
    const userId = req.params.userId;
    const notifications = await Notification.find({ userId: userId }).sort({
      createdAt: -1,
    });

    res.status(200).json(notifications);
  } catch (error) {
    res.status(500).json({ message: "Error fetching notifications" });
  }
});

// Mark Notification as Read
router.patch("/mark-as-read/:id", async (req, res) => {
  try {
    const notificationId = req.params.id;
    await Notification.findByIdAndUpdate(notificationId, { isRead: true });

    res.status(200).json({ message: "Notification marked as read" });
  } catch (error) {
    res.status(500).json({ message: "Error updating notification" });
  }
});

module.exports = router;