import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import styles from '../../styles/StudentSchedule.module.css';
import StudentSidebar from '../../components/Sidebar/StudentSidebar';
import { useSidebar } from "../../components/Sidebar/SidebarContext";

// Get configuration from environment variables
const PROTOCOL = process.env.REACT_APP_PROTOCOL || 'https';
const BACKEND_HOST = process.env.REACT_APP_BACKEND_HOST || 'localhost';
const BACKEND_PORT = process.env.REACT_APP_BACKEND_PORT || '4000';

// Construct the backend URL dynamically
const BACKEND_URL = `${PROTOCOL}://${BACKEND_HOST}:${BACKEND_PORT}`;

function StudentSchedule() {
  const { isCollapsed } = useSidebar();
  const [tutors, setTutors] = useState([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTutor, setSelectedTutor] = useState('');
  const [selectedTutorInfo, setSelectedTutorInfo] = useState(null);
  const [selectedCourse, setSelectedCourse] = useState('')
  const [availableTimeSlots, setAvailableTimeSlots] = useState([]);
  const [selectedTime, setSelectedTime] = useState('');
  const [loading, setLoading] = useState(true);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [upcomingSessions, setUpcomingSessions] = useState([]);
  const [specialRequest, setSpecialRequest] = useState('');
  const [userData, setUserData] = useState(null);

  useEffect(() => {
    const fetchUserSession = async () => {
      try {
        const response = await axios.get(`${BACKEND_URL}/api/auth/session`, {
          withCredentials: true
        });
        
        if (response.data && response.data.user) {
          setUserData(response.data.user);
        } else {
          setError('No user session found. Please log in again.');
        }
      } catch (error) {
        console.error('Error fetching user session:', error);
        setError('Failed to authenticate user. Please log in again.');
      } finally {
        setSessionLoading(false);
      }
    };

    fetchUserSession();
  }, []);

  //should hit a backend endpoint to fetch just upcoming sessions instead
  const fetchUpcomingSessions = useCallback(async () => {
    if (!userData || !userData.id) return;

    try {
      const response = await axios.get(`${BACKEND_URL}/api/sessions/student/upcoming/${userData.id}`, {
        withCredentials: true
      });
      setUpcomingSessions(response.data);
    } catch (error) {
      console.error('Error fetching upcoming sessions:', error);
    }
  }, [userData]);

  const fetchAvailableTimeSlots = useCallback(async () => {
    if (!selectedDate || !selectedTutor) return;

    try {
      setError('');
      const response = await axios.get(
        `${BACKEND_URL}/api/sessions/availability/${selectedTutor}/${selectedDate}`,
        { withCredentials: true }
      );

      if (Array.isArray(response.data)) {
        if (response.data.length > 0) {
          setAvailableTimeSlots(response.data);
        } else {
          setAvailableTimeSlots([]);
          setError('No availability for selected date');
        }
        setSelectedTime('');
      }
    } catch (error) {
      console.error('Error fetching time slots:', error);
      setError('Failed to fetch available time slots');
      setAvailableTimeSlots([]);
      setSelectedTime('');
    }
  }, [selectedDate, selectedTutor]);

  useEffect(() => {
    if (userData && userData.id) {
      const fetchTutors = async () => {
        try {
          const response = await axios.get(`${BACKEND_URL}/api/users/tutors`, {
            withCredentials: true
          });
          setTutors(response.data);
          setLoading(false);
        } catch (error) {
          setError('Error loading tutors');
          setLoading(false);
        }
      };

      fetchTutors();
      fetchUpcomingSessions();
    }
  }, [userData, fetchUpcomingSessions]);

  useEffect(() => {
    fetchAvailableTimeSlots();
  }, [fetchAvailableTimeSlots]);

  const handleDateChange = (e) => {
    const newDate = e.target.value;
    setSelectedDate(newDate);
    setSelectedTime('');
  };

  const handleTutorChange = (e) => {
    const newTutor = e.target.value;
    setSelectedTutor(newTutor);
    setSelectedTime('');

    //new code
    const tutor = tutors.find(t => t._id === newTutor);
    setSelectedTutorInfo(tutor || null);
  };

  const sendNotification = async (id) => {
    const {data} = await axios.post(`${BACKEND_URL}/api/notifications/send-notification`, {
      sessionId: id
    }, {
      withCredentials: true
    });
    return data;
  }

  const handleBooking = async (e) => {
    e.preventDefault();
    setError('');

    if (!userData || !userData.id) {
      setError('User session expired. Please log in again.');
      return;
    }

    try {
      const localDateTime = new Date(`${selectedDate}T${selectedTime}`);

      const response = await axios.post(`${BACKEND_URL}/api/sessions`, {
        tutorId: selectedTutor,
        studentId: userData.id, 
        sessionTime: localDateTime.toISOString(),
        duration: 60,
        specialRequest,
        courseId: selectedCourse
      }, {
        withCredentials: true
      });

      if (response.data.success) {
        setSuccessMessage('Session booked successfully!');

        try {
          await sendNotification(response.data.session._id);
        } catch (notifErr) {
          console.error('Notification sending failed:', notifErr);
        }

        fetchUpcomingSessions();
        setSelectedDate('');
        setSelectedTutor('');
        setSelectedTime('');
        setSpecialRequest('');
        setAvailableTimeSlots([]);
        setTimeout(() => {
          setSuccessMessage('');
        }, 3000);
      }
    } catch (error) {
      console.error('Error booking session:', error);
      setError(error.response?.data?.message || 'Error booking session');
    }
  };

  const formatDateTime = (dateTime) => {
    const date = new Date(dateTime);
    return date.toLocaleString('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'America/Chicago'
    });
  };

  const formatTo12Hour = (time24) => {
    const [hour, minute] = time24.split(':');
    const date = new Date();
    date.setHours(parseInt(hour));
    date.setMinutes(parseInt(minute));
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: 'America/Chicago'      
    });
  };

  if (sessionLoading || loading) {
    return (
      <div className={styles.container}>
        <StudentSidebar selected="student-schedule" />
        <div className={styles.mainContent} style={{ marginLeft: isCollapsed ? "80px" : "260px" }}>
          <div className={styles.spinnerContainer}>
            <div className={styles.spinner}></div>
            <p>Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!userData) {
    return (
      <div className={styles.container}>
        <StudentSidebar selected="student-schedule" />
        <div className={styles.mainContent} style={{ marginLeft: isCollapsed ? "80px" : "260px" }}>
          <div className={styles.error}>
            Session expired or not found. Please log in again.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <StudentSidebar selected="student-schedule" />
      <div className={styles.mainContent} style={{ marginLeft: isCollapsed ? "80px" : "270px" , transition: "margin-left 0.5s ease"}}>
        <div className={styles.scheduleContainer}>
          <h1 className={styles.heading}>Schedule a Session</h1>

          {error && <div className={styles.error}>{error}</div>}
          {successMessage && <div className={styles.success}>{successMessage}</div>}

          <div className={styles.bookingGrid}>
            <div className={styles.bookingForm}>
              <div className={styles.card}>
                <h2 className={styles.cardTitle}>New Booking</h2>
                <form onSubmit={handleBooking} className={styles.form}>
                  <div className={styles.formGroup}>
                    <label htmlFor="tutor">Select Tutor</label>
                    <select
                      id="tutor"
                      value={selectedTutor}
                      onChange={handleTutorChange}
                      required
                      className={styles.formSelect}
                    >
                      <option value="">Select A Tutor</option>
                      {tutors.map((tutor) => (
                        <option key={tutor._id} value={tutor._id}>
                          {tutor.firstName} {tutor.lastName}
                        </option>
                      ))}
                    </select>
                  </div>
                  {selectedTutorInfo && (
                    <div className={styles.tutorCourses}>
                      <label htmlFor="courses">Select Course</label>
                      <select
                        className={styles.formSelect}
                        value={selectedCourse}
                        onChange={(e) => setSelectedCourse(e.target.value)}
                        disabled={!selectedTutorInfo?.courses?.length}
                      >
                        <option value="">Select a course</option>
                        {selectedTutorInfo.courses.map((course, idx) => (
                          <option key={idx} value={course._id}>
                            {course.code} - {course.name}
                          </option>
                        ))}
                      </select>
                      {!selectedTutorInfo?.courses?.length && (
                        <p style={{ fontSize: "0.85rem", color: "gray", marginTop: "5px" }}>
                          Tutor doesn't teach any courses as of now!
                        </p>
                      )}
                    </div>
                  )}

                  <div className={styles.formGroup}>
                    <label htmlFor="date">Select Date</label>
                    <input
                      type="date"
                      id="date"
                      value={selectedDate}
                      onChange={handleDateChange}
                      min={new Date().toISOString().split('T')[0]}
                      required
                      className={styles.formInput}
                    />
                  </div>

                  {selectedDate && selectedTutor && (
                    <div className={styles.formGroup}>
                      <label htmlFor="time">Select Time</label>
                      <select
                        id="time"
                        value={selectedTime}
                        onChange={(e) => setSelectedTime(e.target.value)}
                        required
                        className={styles.formSelect}
                      >
                        <option value="">Select time</option>
                        {availableTimeSlots.map((slot, index) => (
                          <option key={index} value={slot.start}>
                            {formatTo12Hour(slot.start)} - {formatTo12Hour(slot.end)}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className={styles.formGroup}>
                    <label htmlFor="specialRequest">Special Requests</label>
                    <textarea
                      id="specialRequest"
                      placeholder="Any special requests or notes for the tutor?"
                      value={specialRequest}
                      onChange={(e) => setSpecialRequest(e.target.value)}
                      className={styles.formTextarea}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={!selectedDate || !selectedTutor || !selectedTime}
                    className={styles.submitButton}
                  >
                    Book Session
                  </button>
                </form>
              </div>
            </div>

            <div className={styles.upcomingSessions}>
              <div className={styles.card}>
                <h2 className={styles.cardTitle}>Upcoming Sessions</h2>
                <div className={styles.sessionsGrid}>
                  {upcomingSessions.length > 0 ? (
                    upcomingSessions.map((session) => (
                      <div key={session._id} className={styles.sessionCard}>
                        <p className={styles.tutorName}>
                          {session.tutorID.firstName} {session.tutorID.lastName}
                        </p>
                        {session.courseID && (
                          <p className={styles.sessionCourse}>
                            Course: {session.courseID.code} - {session.courseID.title}
                          </p>
                        )}
                        <p className={styles.sessionTime}>
                          {formatDateTime(session.sessionTime)}
                        </p>
                        <p className={styles.sessionDuration}>
                          Duration: {session.duration} minutes
                        </p>
                        <p className={styles.sessionStatus}>
                          Status: {session.status}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className={styles.noSessions}>No upcoming sessions</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default StudentSchedule;