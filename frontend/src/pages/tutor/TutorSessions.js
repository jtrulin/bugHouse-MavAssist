import React, { useEffect, useState, useCallback } from "react";
import axios from "axios";
import styles from "../../styles/TutorSessions.module.css";
import TutorSideBar from "../../components/Sidebar/TutorSidebar";
import { useSidebar } from "../../components/Sidebar/SidebarContext";

// Get configuration from environment variables
const PROTOCOL = process.env.REACT_APP_PROTOCOL || 'https';
const BACKEND_HOST = process.env.REACT_APP_BACKEND_HOST || 'localhost';
const BACKEND_PORT = process.env.REACT_APP_BACKEND_PORT || '4000';

// Construct the backend URL dynamically
const BACKEND_URL = `${PROTOCOL}://${BACKEND_HOST}:${BACKEND_PORT}`;

function TutorSessions() {
  const { isCollapsed } = useSidebar();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [error, setError] = useState("");
  const [userData, setUserData] = useState(null);
  const [attendance, setAttendance] = useState([]);
  const [attendanceRecords, setAttendanceRecords] = useState([]);

  // Fetch the user session data
  useEffect(() => {
    const fetchUserSession = async () => {
      try {
        const response = await axios.get(`${BACKEND_URL}/api/auth/session`, {
          withCredentials: true
        });
        
        if (response.data && response.data.user) {
          setUserData(response.data.user);
        } else {
          setError("No user session found. Please log in again.");
        }
      } catch (error) {
        console.error("Error fetching user session:", error);
        setError("Failed to authenticate user. Please log in again.");
      } finally {
        setSessionLoading(false);
      }
    };
    
    fetchUserSession();
  }, []);

  // Define fetchSessions as a useCallback function
  const fetchSessions = useCallback(async () => {
    if (!userData || !userData.id) return;
    
    try {
      setError(""); // Clear any previous errors
      const response = await axios.get(
        `${BACKEND_URL}/api/sessions/tutor/${userData.id}`,
        { withCredentials: true }
      );
      setSessions(response.data);
    } catch (error) {
      console.error("Error fetching sessions:", error);
      if (error.response) {
        setError(`Failed to load sessions: ${error.response.data.message || error.response.statusText}`);
      } else if (error.request) {
        setError("Server not responding. Please try again later.");
      } else {
        setError(`Failed to load sessions: ${error.message}`);
      }
    } finally {
      setLoading(false);
    }
  }, [userData]);

  // Fetch sessions when userData changes
  useEffect(() => {
    if (userData && userData.id) {
      fetchSessions();
    }
  }, [userData, fetchSessions]);

  //Fetch Attendance Records for no-show logic
  const fetchAttendanceRecords = useCallback(async () => {
    if (!userData || !userData.id) return;
    try {
      const response = await axios.get(
        `${BACKEND_URL}/api/attendance/all`,
        { withCredentials: true }
      );
      setAttendanceRecords(response.data);
    } catch (error) {
      console.error("Error fetching attendance records:", error);
    }
  }, [userData]);

  useEffect(() => {
    if (userData && userData.id) {
      fetchAttendanceRecords();
    }
  }, [userData, fetchAttendanceRecords]);
  //logic ends 


  const formatDateTime = (dateTime) => {
    // Create a date object and adjust for timezone
    const date = new Date(dateTime);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
      .toLocaleString('en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'UTC'
      });
  };

  const handleStatusChange = async (sessionId, newStatus, noShow = false) => { //add noShow parameter
    if (!userData || !userData.id) {
      setError("User session expired. Please log in again.");
      return;
    }
    
    try {
      await axios.put(
        `${BACKEND_URL}/api/sessions/${sessionId}/status`, 
        { status: newStatus, noShow },
        { withCredentials: true }
      );
      // Refresh sessions after status update
      fetchSessions();
      fetchAttendanceRecords();
    } catch (error) {
      console.error("Error updating session status:", error);
      if (error.response) {
        setError(`Failed to update session: ${error.response.data.message || error.response.statusText}`);
      } else {
        setError("Failed to update session status. Please try again.");
      }
    }
  };

  const fetchAttendance = useCallback(async () => {
    try {
      const response = await axios.get(`${BACKEND_URL}/api/attendance/all`, {
        withCredentials: true
      });

      const myAttendance = response.data.filter(
        record => record.sessionID?.tutorID?._id === userData?.id
      );

      setAttendance(myAttendance);
    } catch (err) {
      console.error("Error fetching attendance:", err);
    }
  }, [userData]);

  useEffect(() => {
    if (userData) {
      fetchSessions();  
      fetchAttendance(); 
    }
  }, [userData, fetchSessions, fetchAttendance]);

  // Helper to get attendance for a session
  const getAttendanceForSession = (sessionId) => {
    return attendanceRecords.find(
      (record) => record.sessionID && record.sessionID._id === sessionId
    );
  };

  // Optimistically update attendanceRecords
  const handleMarkNoShow = async (sessionId) => {
    setAttendanceRecords(prev => {
      if (prev.some(r => r.sessionID && r.sessionID._id === sessionId)) return prev;
      return [
        ...prev,
        {
          sessionID: { _id: sessionId },
          wasNoShow: true
        }
      ];
    });
    await handleStatusChange(sessionId, 'Cancelled', true); // Mark no-show = true
    // After backend update, fetch fresh data to ensure sync
    fetchAttendanceRecords();
    fetchSessions();
  };

  // Show loading spinner while either session or data is loading
  if (sessionLoading || loading) {
    return (
      <div className={styles.container}>
        <TutorSideBar selected="sessions" />
        <div className={styles.mainContent} style={{ marginLeft: isCollapsed ? "90px" : "280px" }}>
          <div className={styles.spinnerContainer}>
            <div className={styles.spinner}></div>
            <p>Loading sessions...</p>
          </div>
        </div>
      </div>
    );
  }

  // Show error if no user session is found
  if (!userData) {
    return (
      <div className={styles.container}>
        <TutorSideBar selected="sessions" />
        <div className={styles.mainContent} style={{ marginLeft: isCollapsed ? "90px" : "280px" }}>
          <div className={styles.error}>
            Session expired or not found. Please log in again.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <TutorSideBar selected="sessions" />
      <div className={styles.mainContent} style={{ marginLeft: isCollapsed ? "90px" : "280px" , transition: "margin-left 0.5s ease"}}>
        <h1 className={styles.heading}>Tutor Sessions</h1>
        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.sessionsContainer}>
          <div className={styles.upcomingSessions}>
            <h2>Upcoming Sessions</h2>
            {sessions.filter(session => session.status === 'Scheduled' && session.studentID).length > 0 ? ( /*Checks if session status is "scheduled" and that the student actually exists in the database*/
              <div className={styles.sessionsList}>
                {sessions
                  .filter(session => session.status === 'Scheduled' && session.studentID) /*Checks if session status is "scheduled" and that the student actually exists in the database*/
                  .sort((a, b) => new Date(a.sessionTime) - new Date(b.sessionTime))
                  .map((session) => (
                    <div key={session._id} className={styles.sessionCard}>
                      <div className={styles.sessionInfo}>
                        <p><strong>Student:</strong> {session.studentID ? `${session.studentID.firstName} ${session.studentID.lastName}` : 'Unknown Student'}</p>
                        {session.courseID &&(
                          <p><strong>Course:</strong> {session.courseID.code} - {session.courseID.title}</p>
                        )}
                        <p><strong>Date & Time:</strong> {formatDateTime(session.sessionTime)}</p>
                        <p><strong>Duration:</strong> {session.duration} minutes</p>
                        <p><strong>Status:</strong> {session.status}</p>
                        {session.specialRequest && (
                          <p><strong>Special Request:</strong> {session.specialRequest}</p>
                        )}
                      </div>
                      <div className={styles.sessionActions}>
                        <button
                          className={`${styles.actionButton} ${styles.completeButton}`}
                          onClick={() => handleStatusChange(session._id, 'Completed')}
                        >
                          Mark as Completed
                        </button>
                           <button
                           /* handles it as a cancelled session for now */
                          className={`${styles.actionButton} ${styles.noShowButton}`}
                          onClick={() => handleMarkNoShow(session._id)}
                        >
                          Mark as No Show
                        </button>
                        <button
                          className={`${styles.actionButton} ${styles.cancelButton}`}
                          onClick={() => handleStatusChange(session._id, 'Cancelled')}
                        >
                          Cancel Session
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            ) : (
              <p className={styles.noSessions}>No upcoming sessions</p>
            )}
          </div>

          <div className={styles.completedSessions}>
  <h2>Completed Sessions</h2>
    {sessions.filter(session => session.status === 'Completed' && session.studentID).length > 0 ? (
      <div className={styles.sessionsList}>
        {sessions
          .filter(session => session.status === 'Completed' && session.studentID)
          .sort((a, b) => new Date(b.sessionTime) - new Date(a.sessionTime))
          .map((session) => {
            const attendanceRecord = attendance.find(
              (record) =>
                record.sessionID?._id === session._id &&
                record.userID?._id === userData?._id 
            );

            return (
              <div key={session._id} className={styles.sessionCard}>
                <div className={styles.sessionInfo}>
                  <p><strong>Student:</strong> {session.studentID ? `${session.studentID.firstName} ${session.studentID.lastName}` : 'Unknown Student'}</p>
                  {session.courseID &&(
                    <p><strong>Course:</strong> {session.courseID.code} - {session.courseID.title}</p>
                  )}
                  <p><strong>Date & Time:</strong> {formatDateTime(session.sessionTime)}</p>
                  <p><strong>Duration:</strong> {session.duration} minutes</p>
                  <p><strong>Status:</strong> {session.status}</p>
                  {attendanceRecord?.checkInTime && (
                    <p><strong>Check-in Time:</strong> {formatDateTime(attendanceRecord.checkInTime)}</p>
                  )}
                  {attendanceRecord?.checkOutTime && (
                    <p><strong>Check-out Time:</strong> {formatDateTime(attendanceRecord.checkOutTime)}</p>
                  )}
                  {session.specialRequest && (
                    <p><strong>Special Request:</strong> {session.specialRequest}</p>
                  )}
                </div>
              </div>
            );
          })}
      </div>
    ) : (
      <p>No completed sessions found.</p>
    )}
  </div>

          <div className={styles.cancelledSessions}>
            <h2>Cancelled Sessions</h2>
            {sessions.filter(session => session.status === 'Cancelled' && session.studentID).length > 0 ? (
              <div className={styles.sessionsList}>
                {sessions
                  .filter(session => session.status === 'Cancelled' && session.studentID)
                  .sort((a, b) => new Date(b.sessionTime) - new Date(a.sessionTime))
                  .map((session) => {
                    const attendanceForSession = getAttendanceForSession(session._id);
                    return (
                      <div key={session._id} className={`${styles.sessionCard}`}>
                        <div className={styles.sessionInfo}>
                          <p>
                            <strong>Student:</strong> {session.studentID ? `${session.studentID.firstName} ${session.studentID.lastName}` : 'Unknown Student'}
                            {/*less strict check to detect No Show */}
                            {attendanceForSession?.checkInStatus === 'No Show' && (
                                <span className={styles.noShowTag}>No Show</span>
                              )}
                          </p>
                          {session.courseID &&(
                          <p><strong>Course:</strong> {session.courseID.code} - {session.courseID.title}</p>
                        )}
                        <p><strong>Date & Time:</strong> {formatDateTime(session.sessionTime)}</p>
                          <p><strong>Duration:</strong> {session.duration} minutes</p>
                          <p><strong>Status:</strong> {session.status}</p>
                        </div>
                      </div>
                    );
                  })}
              </div>
            ) : (
              <p className={styles.noSessions}>No cancelled sessions</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default TutorSessions;