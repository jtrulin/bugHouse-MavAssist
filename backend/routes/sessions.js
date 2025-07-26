const express = require('express');
const router = express.Router();
const User = require('../models/User');
const mongoose = require('mongoose'); // Add this importS
const Session = require('../models/Session');
const Attendance = require('../models/Attendance');

// Get available time slots for a tutor on a specific date
router.get('/availability/:tutorId/:date', async (req, res) => {
  try {
    const { tutorId, date } = req.params;
    const tutor = await User.findById(tutorId);
    
    if (!tutor) {
      return res.status(404).json({ message: 'Tutor not found' });
    }

    // Use UTC date to get consistent day of week
    const selectedDate = new Date(date + 'T00:00:00.000Z');
    const dayOfWeek = selectedDate.toLocaleDateString('en-US', { 
      weekday: 'long',
      timeZone: 'UTC'
    });
    
    // Find the tutor's availability for that day
    const dayAvailability = tutor.availability.find(a => a.day === dayOfWeek);
    
    if (!dayAvailability) {
      return res.json([]);
    }

    // Get existing bookings for that date in UTC
    const startOfDay = new Date(date + 'T00:00:00.000Z');
    const endOfDay = new Date(date + 'T23:59:59.999Z');

    const bookedSessions = await Session.find({
      tutorID: tutorId,
      sessionTime: {
        $gte: startOfDay,
        $lt: endOfDay
      },
      status: { $ne: 'Cancelled' }
    });

    const availableSlots = generateTimeSlots(
      dayAvailability.startTime,
      dayAvailability.endTime,
      bookedSessions,
      date
    );

    res.json(availableSlots);
  } catch (error) {
    console.error('Error fetching availability:', error);
    res.status(500).json({ message: 'Error fetching availability' });
  }
});



// Book a session
router.post('/', async (req, res) => {
  try {
    const { tutorId, studentId, sessionTime, duration, specialRequest, courseId } = req.body;

    // Validate required fields
    if (!tutorId || !studentId || !sessionTime || !duration) {
      return res.status(400).json({ 
        message: 'Missing required fields',
        details: { tutorId, studentId, sessionTime, duration }
      });
    }

    // Parse the session time and ensure UTC
    const sessionDate = new Date(sessionTime);
    console.log('Received session time:', sessionTime);
    console.log('Parsed session date:', sessionDate.toISOString());
    
    // Check if the slot is still available
    const existingSession = await Session.findOne({
      tutorID: tutorId,
      sessionTime: sessionDate,
      status: { $ne: 'Cancelled' }
    });

    if (existingSession) {
      return res.status(400).json({ message: 'Time slot no longer available' });
    }

    // Create new session with notes field containing special request
    const session = new Session({
      tutorID: tutorId,
      studentID: studentId,
      sessionTime: sessionDate,
      duration,
      status: 'Scheduled',
      notes: specialRequest || '', // Save special request in notes field
      courseID: courseId
    });

    await session.save();

    // Update tutor's booked sessions
    await User.findByIdAndUpdate(tutorId, {
      $push: {
        bookedSessions: {
          sessionTime: sessionDate,
          duration
        }
      }
    });

    res.json({ 
      success: true, 
      session,
      message: 'Session booked successfully'
    });
  } catch (error) {
    console.error('Error booking session:', error);
    res.status(500).json({ 
      message: 'Error booking session', 
      error: error.message 
    });
  }
});

// Get all sessions for a student
router.get('/student/:studentId', async (req, res) => {
  try {
    const sessions = await Session.find({ 
      studentID: req.params.studentId
    })
    .populate('tutorID', 'firstName lastName')
    .populate('courseID', 'code title')
    .sort({ sessionTime: 1 });
    
    // Ensure consistent time format in response
    const formattedSessions = sessions.map(session => ({
      ...session.toObject(),
      sessionTime: new Date(session.sessionTime).toISOString()
    }));
    
    res.json(formattedSessions);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching sessions', error: error.message });
  }
});

// Get all sessions for a tutor
router.get('/tutor/:tutorId', async (req, res) => {
  try {
    const sessions = await Session.find({ 
      tutorID: req.params.tutorId
    })
    .populate('studentID', 'firstName lastName')
    .populate('courseID', 'code title')
    .sort({ sessionTime: 1 });
    
    // Ensure consistent time format in response
    const formattedSessions = sessions.map(session => ({
      ...session.toObject(),
      sessionTime: new Date(session.sessionTime).toISOString()
    }));
    
    res.json(formattedSessions);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching sessions', error: error.message });
  }
});

//get all sessions
router.get('/all', async (req, res) => {
  try {
    console.log('Starting sessions fetch...');
    
    // Fetch sessions with simpler error handling
    const sessions = await Session.find()
      .populate('studentID', 'firstName lastName')
      .populate('tutorID', 'firstName lastName')
      .populate('courseID', 'code title')
      .sort({ sessionTime: 1 });

    // Format sessions with basic error handling
    const formattedSessions = sessions.map(session => {
      try {
        return {
          id: session._id.toString(),
          studentName: session.studentID 
            ? `${session.studentID.firstName || 'Unknown'} ${session.studentID.lastName || ''}`.trim() 
            : 'Unknown Student',
          tutorName: session.tutorID 
            ? `${session.tutorID.firstName || 'Unknown'} ${session.tutorID.lastName || ''}`.trim() 
            : 'Unknown Tutor',
          date: session.sessionTime 
            ? new Date(session.sessionTime).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              }) 
            : 'N/A',
          time: session.sessionTime 
            ? new Date(session.sessionTime).toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
              }) 
            : 'N/A',
          duration: session.duration || 'N/A',
          status: session.status || 'Unknown'
        };
      } catch (formatError) {
        console.error('Error formatting individual session:', formatError);
        return {
          id: session._id.toString(),
          studentName: 'Format Error',
          tutorName: 'Format Error',
          date: 'Format Error',
          time: 'Format Error',
          duration: 'Format Error',
          status: 'Format Error'
        };
      }
    });
    
    res.json(formattedSessions);
  } catch (error) {
    console.error('Error fetching all sessions:', error);
    res.status(500).json({ 
      message: 'Error fetching all sessions'
    });
  }
});


// Update session status
router.put('/:sessionId/status', async (req, res) => {
  try {
    //added noShow flag
    const { status, noShow } = req.body;

    if (!['Scheduled', 'Completed', 'Cancelled'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const session = await Session.findById(req.params.sessionId).populate('studentID');
    if (!session) {
      return res.status(404).json({ message: 'Session not found' });
    }

    if (!session.studentID || !session.studentID._id) {
      console.error('Session missing studentID. Session ID:', session._id);
      return res.status(400).json({ message: 'Session has no associated student.' });
    }
    
    const studentID = session.studentID._id; 
    const existingAttendance = await Attendance.findOne({
      sessionID: session._id,
      studentID
    });


    if (status === 'Completed' && !existingAttendance) {
      const checkInTime = new Date(session.sessionTime);
      const checkOutTime = new Date(checkInTime.getTime() + session.duration * 60000);

      const attendance = new Attendance({
        sessionID: session._id,
        studentID,
        courseID,
        checkInTime,
        checkOutTime,
        duration: session.duration,
        checkInStatus: 'On Time',
        checkOutStatus: 'On Time',
        wasNoShow: false
      });

      await attendance.save();
    }

    if (status === 'Cancelled' && !existingAttendance) {
      const attendance = new Attendance({
        sessionID: session._id,
        studentID,
        wasNoShow: true,
        //now updates check-in and check-out status based on noShow flag
        checkInStatus: noShow ? 'No Show' : 'Cancelled',
        checkOutStatus: noShow ? 'No Show' : 'Cancelled',
        duration: 0
      });

      await attendance.save();
    } else if (status === 'Cancelled' && existingAttendance) {
      existingAttendance.wasNoShow = true;
      //now updates check-in and check-out status based on noShow flag
      existingAttendance.checkInStatus = noShow ? 'No Show' : 'Cancelled';
      existingAttendance.checkOutStatus = noShow ? 'No Show' : 'Cancelled';
      existingAttendance.duration = 0;
      await existingAttendance.save();
    }

    session.status = status;
    await session.save();

    res.json(session);
  } catch (error) {
    console.error('Error updating session status:', error);
    res.status(500).json({ message: 'Error updating session status', error: error.message });
  }
});

// Helper function to generate available time slots
function generateTimeSlots(startTime, endTime, bookedSessions, date) {
  const slots = [];
  const [startHour, startMinute] = startTime.split(':').map(Number);
  const [endHour, endMinute] = endTime.split(':').map(Number);
  
  // Create Date objects for the specific date using UTC to avoid timezone issues
  const startDate = new Date(`${date}T${startTime}:00.000Z`);
  const endDate = new Date(`${date}T${endTime}:00.000Z`);
  
  // If the date is today, don't show past times
  const now = new Date();
  const isToday = now.toDateString() === new Date(date).toDateString();
  const effectiveStartDate = isToday && now > startDate ? now : startDate;
  
  // Generate slots in 1-hour intervals
  for (let time = effectiveStartDate; 
    time < endDate; 
    time = new Date(time.getTime() + 60 * 60 * 1000)
  ) {
    const sessionStart = new Date(time);
    const sessionEnd = new Date(time.getTime() + 60 * 60 * 1000);

    const start = `${sessionStart.getUTCHours().toString().padStart(2, '0')}:${sessionStart.getUTCMinutes().toString().padStart(2, '0')}`;
    const end = `${sessionEnd.getUTCHours().toString().padStart(2, '0')}:${sessionEnd.getUTCMinutes().toString().padStart(2, '0')}`;
    
    const isBooked = bookedSessions.some(session => {
      const sessionTime = new Date(session.sessionTime);
      return sessionTime.getUTCHours() === sessionStart.getUTCHours() && 
             sessionTime.getUTCMinutes() === sessionStart.getUTCMinutes();
    });

    if (!isBooked) {
      slots.push({ start, end });   //pushing slot as object
    }
  }
  
  return slots;
}


// GET sessions by tutorID
router.get('/', async (req, res) => {
  try {
      // Check if tutorID query parameter is provided
      if (req.query.tutorID) {
          const sessions = await Session.find({ 
              tutorID: req.query.tutorID,
              status: { $in: ['Scheduled', 'Completed'] }
          });
          return res.json(sessions);
      }
      
      // If no query parameter, return all sessions
      const sessions = await Session.find();
      res.json(sessions);
  } catch (error) {
      console.error('Error fetching sessions:', error);
      res.status(500).json({ message: 'Error fetching sessions', error: error.message });
  }
});

module.exports = router;