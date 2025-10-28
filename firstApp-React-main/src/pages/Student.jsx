import React, { useState, useEffect, useRef, useCallback } from 'react';
import styles from './Student.module.css';

const Student = () => {
  const [activeSection, setActiveSection] = useState('scan');
  const [classStatus, setClassStatus] = useState('');
  const [scanResult, setScanResult] = useState('');
  const [manualQR, setManualQR] = useState('');
  const [todayAttendance, setTodayAttendance] = useState([]);
  const [monthlyReport, setMonthlyReport] = useState([]);
  const [reportMonth, setReportMonth] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const qrCheckIntervalRef = useRef(null);
  const lastClassStatusRef = useRef('');
  const initializedRef = useRef(false);

  const system = {
    getCurrentQR: () => {
      const currentQR = localStorage.getItem('currentQR');
      if (!currentQR) return null;

      try {
        const qrData = JSON.parse(currentQR);
        if (Date.now() > qrData.expiry) {
          localStorage.removeItem('currentQR');
          return null;
        }
        return currentQR;
      } catch (error) {
        localStorage.removeItem('currentQR');
        return null;
      }
    },

    markAttendance: (studentId, qrData) => {
      try {
        const qr = JSON.parse(qrData);
        
        if (Date.now() > qr.expiry) {
          return { success: false, message: 'QR Code expired' };
        }

        const student = JSON.parse(localStorage.getItem('currentUser'));
        if (!student || !student.courses || !student.courses.includes(qr.courseId)) {
          return { success: false, message: 'You are not enrolled in this course' };
        }

        const today = new Date().toISOString().split('T')[0];
        const existingAttendance = JSON.parse(localStorage.getItem('attendance') || '[]');
        const alreadyMarked = existingAttendance.find(record => 
          record.studentId === studentId && 
          record.courseId === qr.courseId && 
          record.date === today
        );

        if (alreadyMarked) {
          return { success: false, message: 'Attendance already marked for today' };
        }

        const attendanceRecord = {
          id: Date.now(),
          studentId: studentId,
          courseId: qr.courseId,
          teacherId: qr.teacherId,
          date: today,
          timestamp: new Date().toISOString(),
          status: 'present'
        };

        existingAttendance.push(attendanceRecord);
        localStorage.setItem('attendance', JSON.stringify(existingAttendance));
        
        return { success: true, message: 'Attendance marked successfully' };
      } catch (error) {
        return { success: false, message: 'Invalid QR code format' };
      }
    },

    getAttendanceRecords: (studentId = null, month = null, year = null) => {
      let attendance = JSON.parse(localStorage.getItem('attendance') || '[]');
      
      if (studentId) {
        attendance = attendance.filter(record => record.studentId === studentId);
      }
      
      if (month !== null && year !== null) {
        attendance = attendance.filter(record => {
          const recordDate = new Date(record.date);
          return recordDate.getMonth() === month && recordDate.getFullYear() === year;
        });
      }
      
      return attendance;
    }
  };

  // Memoized checkClassStatus to prevent unnecessary re-renders
  const checkClassStatus = useCallback(() => {
    const currentUser = JSON.parse(localStorage.getItem('currentUser'));
    if (!currentUser) return;

    const courses = JSON.parse(localStorage.getItem('courses')) || [];
    const today = new Date().toISOString().split('T')[0];
    
    let statusHTML = '';
    let hasActiveClass = false;

    const enrolledCourses = courses.filter(course => 
      currentUser.courses && currentUser.courses.includes(course.code)
    );
    
    if (enrolledCourses.length === 0) {
      const newStatus = `<div class="${styles.alert} ${styles.alertWarning}">
        You are not enrolled in any courses. Please contact admin.
      </div>`;
      
      if (lastClassStatusRef.current !== newStatus) {
        setClassStatus(newStatus);
        lastClassStatusRef.current = newStatus;
      }
      return;
    }

    enrolledCourses.forEach(course => {
      const noClassToday = localStorage.getItem(`noClass_${course.code}_${today}`) === 'true';
      
      if (noClassToday) {
        statusHTML += 
          `<div class="${styles.alert} ${styles.alertWarning}">
            <strong>${course.name}:</strong> 🚫 No Class Today
          </div>`;
      } else {
        const currentQR = system.getCurrentQR();
        if (currentQR) {
          try {
            const qrData = JSON.parse(currentQR);
            
            if (qrData.courseId === course.code) {
              if (Date.now() < qrData.expiry) {
                statusHTML += 
                  `<div class="${styles.alert} ${styles.alertSuccess}">
                    <strong>${course.name}:</strong> ✅ QR Code is active! Use camera to scan.
                  </div>`;
                hasActiveClass = true;
              } else {
                statusHTML += 
                  `<div class="${styles.alert} ${styles.alertWarning}">
                    <strong>${course.name}:</strong> ⏰ QR Code expired. Please ask teacher to generate new one.
                  </div>`;
              }
            }
          } catch (error) {
            statusHTML += 
              `<div class="${styles.alert} ${styles.alertError}">
                <strong>${course.name}:</strong> ❌ Invalid QR code. Please ask teacher to generate new one.
              </div>`;
          }
        } else {
          statusHTML += 
            `<div class="${styles.alert} ${styles.alertInfo}">
              <strong>${course.name}:</strong> ⏳ Waiting for teacher to generate QR code.
            </div>`;
        }
      }
    });
    
    if (!hasActiveClass && statusHTML === '') {
      statusHTML = 
        `<div class="${styles.alert} ${styles.alertError}">
          📚 No active classes at the moment. Please check back later or ask teacher to generate QR code.
        </div>`;
    }

    // Only update state if the content actually changed
    if (lastClassStatusRef.current !== statusHTML) {
      setClassStatus(statusHTML);
      lastClassStatusRef.current = statusHTML;
    }

    setCameraActive(hasActiveClass);
  }, []);

  const startQRCheckInterval = useCallback(() => {
    clearInterval(qrCheckIntervalRef.current);
    qrCheckIntervalRef.current = setInterval(() => {
      checkClassStatus();
    }, 10000); // Increased to 10 seconds to reduce frequency
  }, [checkClassStatus]);

  const stopQRCheckInterval = useCallback(() => {
    clearInterval(qrCheckIntervalRef.current);
  }, []);

  const initializeCamera = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        } 
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        setCameraActive(true);
      }
    } catch (error) {
      console.error('Camera error:', error);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      const tracks = streamRef.current.getTracks();
      tracks.forEach(track => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  const handleScannedQR = (qrData) => {
    const currentUser = JSON.parse(localStorage.getItem('currentUser'));
    if (!currentUser) return;
    
    stopCamera();
    
    setScanResult(`
      <div class="${styles.alert} ${styles.alertInfo}">
        <span class="${styles.loading}"></span> Processing QR code...
      </div>
    `);

    setTimeout(() => {
      const result = system.markAttendance(currentUser.username, qrData);
      
      if (result.success) {
        setScanResult(`
          <div class="${styles.alert} ${styles.alertSuccess}">
            ✅ ${result.message}
          </div>
        `);
        
        setManualQR('');
        loadTodayAttendance();
        checkClassStatus(); // Update status after marking attendance
      } else {
        setScanResult(`
          <div class="${styles.alert} ${styles.alertError}">
            ❌ ${result.message}
          </div>
        `);
      }
    }, 1000);
  };

  const submitQRCode = () => {
    const currentUser = JSON.parse(localStorage.getItem('currentUser'));
    if (!currentUser) return;
    
    if (!manualQR.trim()) {
      alert('Please enter QR code data');
      return;
    }

    try {
      JSON.parse(manualQR);
    } catch (error) {
      setScanResult(`
        <div class="${styles.alert} ${styles.alertError}">
          ❌ Invalid QR code format. Please check and try again.
        </div>
      `);
      return;
    }

    const result = system.markAttendance(currentUser.username, manualQR);
    
    if (result.success) {
      setScanResult(`
        <div class="${styles.alert} ${styles.alertSuccess}">
          ✅ ${result.message}
        </div>
      `);
      setManualQR('');
      
      loadTodayAttendance();
      checkClassStatus();
    } else {
      setScanResult(`
        <div class="${styles.alert} ${styles.alertError}">
          ❌ ${result.message}
        </div>
      `);
    }
  };

  const loadTodayAttendance = useCallback(() => {
    const currentUser = JSON.parse(localStorage.getItem('currentUser'));
    if (!currentUser) return;

    const today = new Date().toISOString().split('T')[0];
    const attendance = system.getAttendanceRecords();
    const courses = JSON.parse(localStorage.getItem('courses')) || [];
    
    const enrolledCourses = courses.filter(course => 
      currentUser.courses && currentUser.courses.includes(course.code)
    );
    
    const todayAttendance = attendance.filter(record => 
      record.studentId === currentUser.username && record.date === today
    );

    const attendanceData = enrolledCourses.map(course => {
      const attended = todayAttendance.find(record => record.courseId === course.code);
      return {
        course: course.name,
        status: attended ? 'Present' : 'Absent',
        time: attended ? new Date(attended.timestamp).toLocaleTimeString() : '-'
      };
    });

    setTodayAttendance(attendanceData);
  }, []);

  const loadMonthlyReport = () => {
    if (!reportMonth) {
      alert('Please select a month');
      return;
    }

    const currentUser = JSON.parse(localStorage.getItem('currentUser'));
    if (!currentUser) return;

    const [year, month] = reportMonth.split('-').map(Number);
    const attendance = system.getAttendanceRecords(null, month-1, year);
    const userAttendance = attendance.filter(record => record.studentId === currentUser.username);
    const courses = JSON.parse(localStorage.getItem('courses')) || [];
    
    const reportData = userAttendance.map(record => {
      const course = courses.find(c => c.code === record.courseId);
      return {
        date: record.date,
        course: course ? course.name : record.courseId,
        status: record.status,
        time: new Date(record.timestamp).toLocaleTimeString()
      };
    });

    reportData.sort((a, b) => new Date(b.date) - new Date(a.date));
    setMonthlyReport(reportData);
  };

  const logout = () => {
    localStorage.removeItem('currentUser');
    window.location.href = '/';
  };

  // Initialize component only once
  useEffect(() => {
    if (initializedRef.current) return;
    
    const currentUser = JSON.parse(localStorage.getItem('currentUser'));
    if (!currentUser) {
      window.location.href = '/';
      return;
    }

    // Set initial month
    const now = new Date();
    setReportMonth(now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0'));

    // Load initial data
    checkClassStatus();
    loadTodayAttendance();

    initializedRef.current = true;

    return () => {
      stopCamera();
      stopQRCheckInterval();
    };
  }, [checkClassStatus, loadTodayAttendance, stopQRCheckInterval]);

  // Handle section changes separately
  useEffect(() => {
    if (!initializedRef.current) return;

    if (activeSection === 'scan') {
      startQRCheckInterval();
      initializeCamera();
    } else {
      stopCamera();
      stopQRCheckInterval();
    }

    if (activeSection === 'today') {
      loadTodayAttendance();
    }
  }, [activeSection, startQRCheckInterval, stopQRCheckInterval, loadTodayAttendance]);

  return (
    <div className={styles.dashboard}>
      <div className={styles.header}>
        <h1>Student Dashboard</h1>
        <button onClick={logout}>Logout</button>
      </div>
      
      <div className={styles.navMenu}>
        <button 
          className={activeSection === 'scan' ? styles.active : ''}
          onClick={() => setActiveSection('scan')}
        >
          Scan QR Code
        </button>
        <button 
          className={activeSection === 'report' ? styles.active : ''}
          onClick={() => setActiveSection('report')}
        >
          View Monthly Report
        </button>
        <button 
          className={activeSection === 'today' ? styles.active : ''}
          onClick={() => setActiveSection('today')}
        >
          Today's Attendance
        </button>
      </div>

      <div className={styles.content}>
        {/* Scan QR Section */}
        {activeSection === 'scan' && (
          <div className={styles.section}>
            <h2>Scan QR Code for Attendance</h2>
            <div 
              className={styles.classStatus} 
              dangerouslySetInnerHTML={{ __html: classStatus }} 
            />
            
            {/* Camera Scanner Section */}
            {cameraActive && (
              <div className={styles.scannerContainer}>
                <div className={styles.scannerHeader}>
                  <h3>📷 Camera Scanner</h3>
                  <p>Point your camera at the QR code shown by your teacher</p>
                </div>
                
                <div className={styles.cameraPlaceholder}>
                  <div className={styles.cameraFrame}>
                    <video 
                      ref={videoRef}
                      autoPlay 
                      playsInline 
                      className={styles.cameraPreview}
                    />
                    <div className={styles.scanOverlay}>
                      <div className={styles.scanFrame}></div>
                      <div className={styles.scanLine}></div>
                    </div>
                  </div>
                  <div className={styles.cameraInstructions}>
                    <p>🔍 Position QR code within the frame to scan automatically</p>
                    <p>💡 Ensure good lighting for better detection</p>
                  </div>
                </div>
              </div>
            )}

            {/* Manual Entry Section */}
            <div className={styles.manualEntry}>
              <h4>Or enter QR code manually:</h4>
              <div className={styles.formGroup}>
                <input 
                  type="text" 
                  value={manualQR}
                  onChange={(e) => setManualQR(e.target.value)}
                  placeholder="Paste QR code data here" 
                  className={styles.input}
                />
                <button onClick={submitQRCode} className={styles.primary}>
                  Submit Attendance
                </button>
              </div>
            </div>
            
            <div 
              className={styles.scanResult} 
              dangerouslySetInnerHTML={{ __html: scanResult }} 
            />
          </div>
        )}

        {/* Monthly Report Section */}
        {activeSection === 'report' && (
          <div className={styles.section}>
            <h2>Monthly Attendance Report</h2>
            <div className={styles.formGroup}>
              <input 
                type="month" 
                value={reportMonth}
                onChange={(e) => setReportMonth(e.target.value)}
                className={styles.input}
              />
              <button onClick={loadMonthlyReport} className={styles.primary}>
                Load Report
              </button>
            </div>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Course</th>
                  <th>Status</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {monthlyReport.length > 0 ? (
                  monthlyReport.map((record, index) => (
                    <tr key={index}>
                      <td>{record.date}</td>
                      <td>{record.course}</td>
                      <td className={record.status === 'present' ? styles.statusPresent : styles.statusAbsent}>
                        {record.status.toUpperCase()}
                      </td>
                      <td>{record.time}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="4" className={styles.noData}>
                      {reportMonth ? 
                        `📊 No attendance records found for ${reportMonth}` : 
                        'Select a month to view your attendance report'
                      }
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Today's Attendance Section */}
        {activeSection === 'today' && (
          <div className={styles.section}>
            <h2>Today's Attendance</h2>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Course</th>
                  <th>Status</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {todayAttendance.length > 0 ? (
                  todayAttendance.map((item, index) => (
                    <tr key={index}>
                      <td>{item.course}</td>
                      <td>
                        <span className={item.status === 'Present' ? styles.statusPresent : styles.statusAbsent}>
                          {item.status === 'Present' ? '✅ Present' : '❌ Absent'}
                        </span>
                      </td>
                      <td>{item.time}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="3" className={styles.noData}>
                      {todayAttendance.length === 0 ? 'No courses enrolled or no attendance recorded today' : 'Loading...'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default Student;