class AttendanceSystem {
    constructor() {
        this.initializeDefaultData();
        this.users = JSON.parse(localStorage.getItem('users')) || [];
        this.courses = JSON.parse(localStorage.getItem('courses')) || [];
        this.currentUser = null;
    }

    initializeDefaultData() {
        // Initialize users if not exists
        if (!localStorage.getItem('users')) {
            const defaultUsers = [
                { username: 'admin', password: 'admin123', role: 'admin', name: 'System Administrator' },
                { username: 'teacher1', password: 'teacher123', role: 'teacher', name: 'Ali Ahmed', courses: ['CS101'] },
                { username: 'student1', password: 'student123', role: 'student', name: 'Student One', rollNo: '001', courses: ['CS101', 'MATH201'] },
                { username: 'student2', password: 'student123', role: 'student', name: 'Student Two', rollNo: '002', courses: ['CS101', 'PHY101'] },
                { username: 'student3', password: 'student123', role: 'student', name: 'Student Three', rollNo: '003', courses: ['MATH201', 'PHY101'] }
            ];
            localStorage.setItem('users', JSON.stringify(defaultUsers));
            this.users = defaultUsers;
        }

        // Initialize courses if not exists
        if (!localStorage.getItem('courses')) {
            const defaultCourses = [
                { code: 'CS101', name: 'Introduction to Programming' },
                { code: 'MATH201', name: 'Calculus I' },
                { code: 'PHY101', name: 'Physics Fundamentals' }
            ];
            localStorage.setItem('courses', JSON.stringify(defaultCourses));
            this.courses = defaultCourses;
        }

        // Initialize attendance if not exists
        if (!localStorage.getItem('attendance')) {
            localStorage.setItem('attendance', JSON.stringify([]));
        }
    }

    login(username, password) {
        let user = this.users.find(u => 
            u.username === username && 
            u.password === password
        );
        
        if (!user) {
            user = this.users.find(u => 
                u.role === 'student' && 
                u.rollNo === username && 
                u.password === password
            );
        }

        if (user) {
            this.currentUser = user;
            localStorage.setItem('currentUser', JSON.stringify(user));
            return { success: true, user: user };
        }
        
        return { success: false, message: 'Invalid username/roll number or password' };
    }

    logout() {
        this.currentUser = null;
        localStorage.removeItem('currentUser');
        window.location.href = '/';
    }

    generateQRCode(courseId, teacherId) {
        const qrData = {
            courseId: courseId,
            teacherId: teacherId,
            timestamp: new Date().toISOString(),
            expiry: Date.now() + (15 * 60 * 1000) // 15 minutes
        };

        const qrString = JSON.stringify(qrData);
        localStorage.setItem('currentQR', qrString);
        console.log('✅ QR Generated Successfully:', qrData);
        return qrString;
    }

    markAttendance(studentId, qrData) {
        try {
            const qr = JSON.parse(qrData);
            
            if (Date.now() > qr.expiry) {
                return { success: false, message: 'QR Code expired' };
            }

            const student = this.users.find(u => u.username === studentId);
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
            
            console.log('✅ Attendance Marked:', attendanceRecord);
            return { success: true, message: 'Attendance marked successfully' };
        } catch (error) {
            console.error('❌ Attendance Error:', error);
            return { success: false, message: 'Invalid QR code format' };
        }
    }

    getAttendanceRecords(courseId = null, month = null, year = null) {
        let attendance = JSON.parse(localStorage.getItem('attendance') || '[]');
        
        if (courseId) {
            attendance = attendance.filter(record => record.courseId === courseId);
        }
        
        if (month !== null && year !== null) {
            attendance = attendance.filter(record => {
                const recordDate = new Date(record.date);
                return recordDate.getMonth() === month && recordDate.getFullYear() === year;
            });
        }
        
        return attendance;
    }

    getCurrentQR() {
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
            console.error('Invalid QR data in storage');
            localStorage.removeItem('currentQR');
            return null;
        }
    }

    addStudent(name, rollNo) {
        const newStudent = {
            username: `student${rollNo}`,
            password: 'student123',
            role: 'student',
            name: name,
            rollNo: rollNo,
            courses: []
        };
        
        this.users.push(newStudent);
        localStorage.setItem('users', JSON.stringify(this.users));
        return newStudent;
    }

    addCourse(code, name) {
        const newCourse = { code, name };
        this.courses.push(newCourse);
        localStorage.setItem('courses', JSON.stringify(this.courses));
        return newCourse;
    }
}

// Create and export system instance
export const system = new AttendanceSystem();