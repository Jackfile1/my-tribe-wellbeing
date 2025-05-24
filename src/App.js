import React, { useState, useEffect } from 'react';
import './App.css';
import { auth, db } from './firebase';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  addDoc, 
  updateDoc, 
  doc, 
  onSnapshot,
  orderBy,
  serverTimestamp,
  writeBatch,
  deleteDoc,
  limit
} from 'firebase/firestore';
import {
  signInWithEmailAndPassword,
  signOut
} from 'firebase/auth';

// Constants
const ORDERED_DAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday'
];

const STRATEGY_CATEGORIES = [
  'Behavioral Management',
  'Communication Techniques',
  'Crisis Intervention',
  'Emotional Support',
  'Daily Routines',
  'Educational Strategies',
  'Therapeutic Approaches',
  'Family Engagement',
  'Social Skills Development',
  'Self-Regulation',
  'Other'
];

// Helper Functions
const getCurrentWeekDates = () => {
  const now = new Date();
  const sunday = new Date(now);
  sunday.setDate(now.getDate() - now.getDay());
  const saturday = new Date(sunday);
  saturday.setDate(sunday.getDate() + 6);
  
  return {
    startDate: sunday.toISOString().split('T')[0],
    endDate: saturday.toISOString().split('T')[0]
  };
};

const getWeekDates = (startDate) => {
  const dates = [];
  if (!startDate) return dates;
  
  const start = new Date(startDate);
  for (let i = 0; i < 7; i++) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    dates.push({
      date: date,
      dayName: date.toLocaleDateString('en-US', { weekday: 'long' }),
      formattedDate: date.toLocaleDateString('en-GB', { 
        day: 'numeric',
        month: 'short'
      })
    });
  }
  return dates;
};

const getWeekNumber = (date) => {
  const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
  const pastDaysOfYear = (date - firstDayOfYear) / 86400000;
  return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
};
function App() {
  // Core State
  const [currentUser, setCurrentUser] = useState(null);
  const [isManager, setIsManager] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState('home');
  const [activeCategory, setActiveCategory] = useState('');
  const [selectedTeamMember, setSelectedTeamMember] = useState(null);

  // Check-in State
  const [checkInData, setCheckInData] = useState({
    mood: '',
    moodIntensity: '3',
    energyLevel: '',
    needsSupport: false,
    supportNote: '',
    contactPreference: '',
    urgent: false,
    timestamp: null
  });

  // Debrief State
  const [debriefData, setDebriefData] = useState({
    summary: '',
    whatWorkedWell: '',
    shareWithTeam: false,
    category: '',
    customCategory: ''
  });

  // Manager State
  const [pendingSupport, setPendingSupport] = useState([]);
  const [handledTickets, setHandledTickets] = useState([]);
  const [pendingStrategies, setPendingStrategies] = useState([]);
  const [approvedStrategies, setApprovedStrategies] = useState([]);
  const [archivedStrategies, setArchivedStrategies] = useState([]);
  const [notifications, setNotifications] = useState({
    support: [],
    strategies: [],
    total: 0
  });

  // On-Call Schedule State
  const [weeklySchedules, setWeeklySchedules] = useState([]);
  const [currentWeekSchedule, setCurrentWeekSchedule] = useState(null);
  const [selectedWeek, setSelectedWeek] = useState(null);
  const [weeklySchedule, setWeeklySchedule] = useState({
    weekDates: getCurrentWeekDates(),
    days: ORDERED_DAYS.reduce((acc, day) => ({
      ...acc,
      [day]: { name: '', phone: '', hours: '' }
    }), {})
  });

  // Personal History State
  const [personalHistory, setPersonalHistory] = useState([]);
  const [teamHistory, setTeamHistory] = useState([]);

  // Monthly Focus State
  const [monthlyFocus, setMonthlyFocus] = useState({
    title: '',
    description: ''
  });

  // New Monthly Focus Form State
  const [newMonthlyFocus, setNewMonthlyFocus] = useState({
    title: '',
    description: '',
    month: new Date().toISOString().slice(0, 7),
    active: true
  });

  // Dialog State
  const [showSupportDialog, setShowSupportDialog] = useState(false);

  // Manager Dashboard Active Tab
  const [activeManagerTab, setActiveManagerTab] = useState('support');

  // New Week Selection State
  const [selectedDate, setSelectedDate] = useState('');
// Authentication Effect
useEffect(() => {
  const unsubscribe = auth.onAuthStateChanged(async (user) => {
    if (user) {
      try {
        const userDoc = await getDocs(query(
          collection(db, 'users'),
          where('email', '==', user.email)
        ));

        if (!userDoc.empty) {
          const userData = userDoc.docs[0].data();
          setCurrentUser({ ...user, ...userData });
          setIsManager(userData.role === 'manager');
          
          // Load data based on role
          if (userData.role === 'manager') {
            setupManagerListeners();
          }
          // Load common data for all users
          setupCommonListeners();
        }
      } catch (error) {
        console.error('Error checking user role:', error);
      }
    } else {
      setCurrentUser(null);
      setIsManager(false);
    }
    setLoading(false);
  });

  return () => unsubscribe();
}, []);

// Data Listeners Setup
const setupManagerListeners = () => {
  // Support Requests Listener
  const supportUnsubscribe = onSnapshot(
    collection(db, 'supportRequests'),
    (snapshot) => {
      const requests = [];
      const handled = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        if (!data.handled) {
          requests.push({
            id: doc.id,
            ...data
          });
        } else {
          handled.push({
            id: doc.id,
            ...data,
            handledByName: data.handledBy
          });
        }
      });
      setPendingSupport(requests);
      setHandledTickets(handled);
      setNotifications(prev => ({
        ...prev,
        support: requests,
        total: requests.length + prev.strategies.length
      }));
    }
  );

  // Strategy Reviews Listener
  const strategyUnsubscribe = onSnapshot(
    collection(db, 'strategies'),
    (snapshot) => {
      const pending = [];
      const approved = [];
      const archived = [];
      
      snapshot.forEach((doc) => {
        const data = doc.data();
        if (!data.approved && !data.archived) {
          pending.push({
            id: doc.id,
            ...data
          });
        } else if (data.approved) {
          approved.push({
            id: doc.id,
            ...data
          });
        } else if (data.archived) {
          archived.push({
            id: doc.id,
            ...data
          });
        }
      });
      
      setPendingStrategies(pending);
      setApprovedStrategies(approved);
      setArchivedStrategies(archived);
      setNotifications(prev => ({
        ...prev,
        strategies: pending,
        total: pending.length + prev.support.length
      }));
    }
  );

  // Team History Listener
  const teamHistoryUnsubscribe = onSnapshot(
    query(
      collection(db, 'checkIns'),
      orderBy('timestamp', 'desc')
    ),
    (snapshot) => {
      const history = [];
      snapshot.forEach(doc => {
        history.push({ id: doc.id, ...doc.data() });
      });
      setTeamHistory(history);
    }
  );

  return () => {
    supportUnsubscribe();
    strategyUnsubscribe();
    teamHistoryUnsubscribe();
  };
};

const setupCommonListeners = () => {
  // On-Call Schedule Listener
  const scheduleUnsubscribe = onSnapshot(
    collection(db, 'onCallSchedule'),
    (snapshot) => {
      const schedules = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        if (data && data.weekDates && data.weekDates.startDate) {
          schedules.push({
            id: doc.id,
            ...data
          });
        }
      });
      
      setWeeklySchedules(schedules);
      
      // Find current week's schedule
      const now = new Date();
      const currentSchedule = schedules.find(schedule => {
        const start = new Date(schedule.weekDates.startDate);
        const end = new Date(schedule.weekDates.endDate);
        return now >= start && now <= end;
      });
      
      if (currentSchedule) {
        setCurrentWeekSchedule(currentSchedule);
        if (!selectedWeek) {
          setWeeklySchedule(currentSchedule);
          setSelectedWeek(currentSchedule.id);
        }
      } else {
        setCurrentWeekSchedule(null);
      }
    }
  );

  // Monthly Focus Listener
  const monthlyFocusUnsubscribe = onSnapshot(
    query(
      collection(db, 'monthlyFocus'),
      where('active', '==', true)
    ),
    (snapshot) => {
      snapshot.forEach(doc => {
        setMonthlyFocus({ id: doc.id, ...doc.data() });
      });
    }
  );

  // Personal History Listener
  const personalHistoryUnsubscribe = onSnapshot(
    query(
      collection(db, 'checkIns'),
      where('userId', '==', currentUser?.uid),
      orderBy('timestamp', 'desc')
    ),
    (snapshot) => {
      const history = [];
      snapshot.forEach(doc => {
        history.push({ id: doc.id, ...doc.data() });
      });
      setPersonalHistory(history);
    }
  );

  return () => {
    scheduleUnsubscribe();
    monthlyFocusUnsubscribe();
    personalHistoryUnsubscribe();
  };
};

// Authentication Functions
const handleLogin = async (email, password) => {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    
    const userDoc = await getDocs(query(
      collection(db, 'users'),
      where('email', '==', user.email)
    ));

    if (!userDoc.empty) {
      const userData = userDoc.docs[0].data();
      setCurrentUser({ ...user, ...userData });
      setIsManager(userData.role === 'manager');
      setError(null);
    }
  } catch (error) {
    setError('Invalid email or password');
    console.error('Login error:', error);
  }
};

const handleLogout = async () => {
  try {
    await signOut(auth);
    setCurrentUser(null);
    setIsManager(false);
    setCurrentPage('home');
  } catch (error) {
    console.error('Logout error:', error);
  }
};
// Check-in and Support Handlers
const handleCheckInSubmit = async (e) => {
  e.preventDefault();
  try {
    const submission = {
      ...checkInData,
      timestamp: serverTimestamp(),
      userId: currentUser?.uid,
      userEmail: currentUser?.email,
      handled: false
    };

    // Add to check-ins
    const docRef = await addDoc(collection(db, 'checkIns'), submission);

    // If support needed, create support request
    if (submission.needsSupport) {
      const supportRequest = {
        checkInId: docRef.id,
        ...submission,
        status: 'pending',
        timestamp: serverTimestamp()
      };

      await addDoc(collection(db, 'supportRequests'), supportRequest);
    }

    // Update personal history
    setPersonalHistory(prev => [submission, ...prev]);

    // Reset form
    setCheckInData({
      mood: '',
      moodIntensity: '3',
      energyLevel: '',
      needsSupport: false,
      supportNote: '',
      contactPreference: '',
      urgent: false,
      timestamp: null
    });

    setShowSupportDialog(false);
    alert('Check-in submitted successfully');
  } catch (error) {
    console.error('Error submitting check-in:', error);
    alert('Error submitting check-in');
  }
};

// Debrief and Strategy Handlers
const handleDebriefSubmit = async (e) => {
  e.preventDefault();
  try {
    const submission = {
      ...debriefData,
      timestamp: serverTimestamp(),
      userId: currentUser?.uid,
      userEmail: currentUser?.email
    };

    // Add debrief
    const debriefRef = await addDoc(collection(db, 'debriefs'), submission);

    // If sharing strategy, create pending strategy
    if (submission.shareWithTeam && submission.whatWorkedWell) {
      await addDoc(collection(db, 'strategies'), {
        content: submission.whatWorkedWell,
        category: submission.category === 'Other' ? submission.customCategory : submission.category,
        originalCategory: submission.category,
        debriefId: debriefRef.id,
        userId: currentUser.uid,
        userEmail: currentUser.email,
        timestamp: serverTimestamp(),
        approved: false,
        archived: false,
        highlighted: false
      });
    }

    // Reset form
    setDebriefData({
      summary: '',
      whatWorkedWell: '',
      shareWithTeam: false,
      category: '',
      customCategory: ''
    });

    alert('Debrief submitted successfully');
  } catch (error) {
    console.error('Error submitting debrief:', error);
    alert('Error submitting debrief');
  }
};

// Support Request Handler
const handleSupportRequest = async (requestId) => {
  try {
    const requestRef = doc(db, 'supportRequests', requestId);
    await updateDoc(requestRef, {
      handled: true,
      handledBy: currentUser.email.split('@')[0],
      handledAt: serverTimestamp()
    });

    // Update local state immediately
    setPendingSupport(prev => prev.filter(req => req.id !== requestId));
    const handledRequest = pendingSupport.find(req => req.id === requestId);
    if (handledRequest) {
      setHandledTickets(prev => [{
        ...handledRequest,
        handledAt: new Date(),
        handledBy: currentUser.email.split('@')[0]
      }, ...prev]);
    }

    // Remove from notifications
    setNotifications(prev => ({
      ...prev,
      support: prev.support.filter(n => n.id !== requestId),
      total: prev.total - 1
    }));

  } catch (error) {
    console.error('Error handling support request:', error);
    alert('Error handling support request');
  }
};
// Strategy Review Functions
const handleStrategyReview = async (strategyId, action, highlighted = false) => {
  try {
    const strategyRef = doc(db, 'strategies', strategyId);
    
    switch(action) {
      case 'approve':
        await updateDoc(strategyRef, {
          approved: true,
          archived: false,
          highlighted: highlighted,
          reviewedBy: currentUser.uid,
          reviewedAt: serverTimestamp()
        });
        break;
      case 'archive':
        await updateDoc(strategyRef, {
          approved: false,
          archived: true,
          archivedBy: currentUser.uid,
          archivedAt: serverTimestamp()
        });
        break;
      default:
        throw new Error('Invalid action');
    }

    // Update local state
    setPendingStrategies(prev => prev.filter(s => s.id !== strategyId));
    
    if (action === 'approve') {
      const approvedStrategy = pendingStrategies.find(s => s.id === strategyId);
      if (approvedStrategy) {
        setApprovedStrategies(prev => [
          { ...approvedStrategy, reviewedAt: new Date(), highlighted },
          ...prev
        ]);
      }
    } else if (action === 'archive') {
      const archivedStrategy = pendingStrategies.find(s => s.id === strategyId);
      if (archivedStrategy) {
        setArchivedStrategies(prev => [
          { ...archivedStrategy, archivedAt: new Date() },
          ...prev
        ]);
      }
    }

  } catch (error) {
    console.error('Error reviewing strategy:', error);
    alert('Error reviewing strategy');
  }
};

// Enhanced On-Call Schedule Management
const handleDateSelection = (date) => {
  const selectedDate = new Date(date);
  const sunday = new Date(selectedDate);
  sunday.setDate(selectedDate.getDate() - selectedDate.getDay());
  
  const saturday = new Date(sunday);
  saturday.setDate(sunday.getDate() + 6);

  setWeeklySchedule({
    weekDates: {
      startDate: sunday.toISOString().split('T')[0],
      endDate: saturday.toISOString().split('T')[0]
    },
    days: ORDERED_DAYS.reduce((acc, day) => ({
      ...acc,
      [day]: { name: '', phone: '', hours: '' }
    }), {})
  });
  setSelectedWeek(null);
  setSelectedDate(date);
};

const updateWeeklySchedule = async (newSchedule) => {
  try {
    if (!isManager) throw new Error('Unauthorized action');
    if (!newSchedule.weekDates.startDate || !newSchedule.weekDates.endDate) {
      throw new Error('Please select week dates');
    }

    // Check if a schedule already exists for this week
    const existingSchedule = weeklySchedules.find(schedule => 
      schedule.weekDates.startDate === newSchedule.weekDates.startDate
    );

    if (existingSchedule && !selectedWeek) {
      throw new Error('A schedule already exists for this week');
    }

    const batch = writeBatch(db);
    let scheduleRef;

    if (selectedWeek) {
      // Update existing schedule
      scheduleRef = doc(db, 'onCallSchedule', selectedWeek);
      batch.update(scheduleRef, {
        weekDates: newSchedule.weekDates,
        days: newSchedule.days,
        updatedBy: currentUser.uid,
        updatedAt: serverTimestamp()
      });
    } else {
      // Create new schedule
      scheduleRef = doc(collection(db, 'onCallSchedule'));
      batch.set(scheduleRef, {
        weekDates: newSchedule.weekDates,
        days: newSchedule.days,
        createdBy: currentUser.uid,
        createdAt: serverTimestamp()
      });
    }

    await batch.commit();
    setWeeklySchedule(newSchedule);
    setSelectedDate('');
    alert(selectedWeek ? 'Schedule updated successfully' : 'New schedule created successfully');
  } catch (error) {
    console.error('Error updating on-call schedule:', error);
    alert(error.message || 'Failed to update on-call schedule');
  }
};

const deleteSchedule = async (scheduleId) => {
  try {
    if (window.confirm('Are you sure you want to delete this schedule?')) {
      await deleteDoc(doc(db, 'onCallSchedule', scheduleId));
      setSelectedWeek(null);
      setWeeklySchedule({
        weekDates: getCurrentWeekDates(),
        days: ORDERED_DAYS.reduce((acc, day) => ({
          ...acc,
          [day]: { name: '', phone: '', hours: '' }
        }), {})
      });
      alert('Schedule deleted successfully');
    }
  } catch (error) {
    console.error('Error deleting schedule:', error);
    alert('Error deleting schedule');
  }
};
return (
  <div className="App">
    <header className="App-header">
      <h1>My Tribe Connect</h1>
      {!currentUser ? (
        <div className="login-card">
          <form onSubmit={(e) => {
            e.preventDefault();
            handleLogin(e.target.email.value, e.target.password.value);
          }}>
            {error && <div className="error-message">{error}</div>}
            <div className="form-group">
              <input 
                type="email" 
                name="email" 
                placeholder="Email"
                required 
                className="black-white-input"
              />
            </div>
            <div className="form-group">
              <input 
                type="password" 
                name="password" 
                placeholder="Password"
                required 
                className="black-white-input"
              />
            </div>
            <button type="submit" className="black-white-button">Login</button>
          </form>
        </div>
      ) : (
        <>
          <div className="user-controls">
            <span className="user-info">{currentUser.email}</span>
            {isManager && (
              <span className="manager-badge">
                Manager
                {notifications.total > 0 && (
                  <span className="notification-dot">
                    {notifications.total}
                  </span>
                )}
              </span>
            )}
            <button onClick={handleLogout} className="black-white-button">Logout</button>
          </div>
          <nav className="nav-menu">
            <button 
              className={`nav-button ${currentPage === 'home' ? 'active' : ''}`}
              onClick={() => setCurrentPage('home')}
            >
              Home
            </button>
            <button 
              className={`nav-button ${currentPage === 'resources' ? 'active' : ''}`}
              onClick={() => setCurrentPage('resources')}
            >
              Resources
            </button>
            <button 
              className={`nav-button ${currentPage === 'team' ? 'active' : ''}`}
              onClick={() => setCurrentPage('team')}
            >
              Team Page
            </button>
            <button 
              className={`nav-button ${currentPage === 'wellbeing' ? 'active' : ''}`}
              onClick={() => setCurrentPage('wellbeing')}
            >
              My Wellbeing
            </button>
            {isManager && (
              <>
                <button 
                  className={`nav-button ${currentPage === 'manager' ? 'active' : ''}`}
                  onClick={() => setCurrentPage('manager')}
                >
                  Manager Dashboard
                  {notifications.total > 0 && (
                    <span className="notification-dot">
                      {notifications.total}
                    </span>
                  )}
                </button>
                <button 
                  className={`nav-button ${currentPage === 'team-overview' ? 'active' : ''}`}
                  onClick={() => setCurrentPage('team-overview')}
                >
                  Team Overview
                </button>
              </>
            )}
          </nav>
        </>
      )}
    </header>

    <main>
      {currentUser ? (
        <>
{currentPage === 'home' && (
  <div className="split-screen-layout">
    {/* Left Panel - Information Display */}
    <div className="left-panel">
      {/* Monthly Focus */}
      {monthlyFocus && (
        <div className="info-card monthly-focus">
          <h2>Monthly Focus</h2>
          <p className="current-month">
            {monthlyFocus.month ? new Date(monthlyFocus.month).toLocaleString('default', { month: 'long', year: 'numeric' }) 
              : new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}
          </p>
          <div className="focus-content">
            <h3>{monthlyFocus.title}</h3>
            <p>{monthlyFocus.description}</p>
          </div>
        </div>
      )}

      {/* On-Call Display - Shows Current Week */}
      <div className="info-card">
        <h2>On Call Schedule</h2>
        {currentWeekSchedule && (
          <div className="schedule-dates">
            <p>Week of: {new Date(currentWeekSchedule.weekDates.startDate).toLocaleDateString()} 
               - {new Date(currentWeekSchedule.weekDates.endDate).toLocaleDateString()}</p>
          </div>
        )}
        <div className="weekly-schedule">
          {ORDERED_DAYS.map(day => {
            const schedule = currentWeekSchedule?.days[day] || weeklySchedule.days[day];
            const isToday = new Date().toLocaleDateString('en-US', { weekday: 'long' }) === day;
            
            return (
              <div key={day} className={`schedule-day ${isToday ? 'current-day' : ''}`}>
                <div className="day-header">
                  <h3>{day}</h3>
                  <span className="date-label">
                    {getWeekDates(currentWeekSchedule?.weekDates.startDate || weeklySchedule.weekDates.startDate)
                      .find(d => d.dayName === day)?.formattedDate || ''}
                  </span>
                </div>
                {schedule?.name ? (
                  <div className="schedule-content">
                    <p className="on-call-name">{schedule.name}</p>
                    <p className="on-call-phone">📞 {schedule.phone}</p>
                    <p className="on-call-hours">⏰ {schedule.hours}</p>
                  </div>
                ) : (
                  <p className="no-schedule">No schedule set</p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>

    {/* Right Panel - Check-in and Debrief Forms */}
    <div className="right-panel">
      {/* Daily Check-in Form */}
      <div className="form-card">
        <h2>Daily Check-In</h2>
        <form onSubmit={handleCheckInSubmit}>
          <div className="form-group">
            <label>How are you feeling today?</label>
            <select 
              value={checkInData.mood}
              onChange={(e) => setCheckInData({...checkInData, mood: e.target.value})}
              required
              className="black-white-select"
            >
              <option value="">Choose...</option>
              <option value="calm">Calm 😌</option>
              <option value="happy">Happy 😊</option>
              <option value="anxious">Anxious 😰</option>
              <option value="sad">Sad 😢</option>
              <option value="angry">Angry 😠</option>
              <option value="overwhelmed">Overwhelmed 😫</option>
              <option value="numb">Numb 😐</option>
            </select>
          </div>

          <div className="form-group">
            <label>How intense is this feeling? (1-5)</label>
            <input 
              type="range" 
              min="1" 
              max="5" 
              value={checkInData.moodIntensity}
              onChange={(e) => setCheckInData({...checkInData, moodIntensity: e.target.value})}
              className="black-white-slider"
            />
            <div className="slider-labels">
              <span>Mild</span>
              <span>Strong</span>
            </div>
          </div>

          <div className="form-group">
            <label>Energy Level</label>
            <select 
              value={checkInData.energyLevel}
              onChange={(e) => setCheckInData({...checkInData, energyLevel: e.target.value})}
              required
              className="black-white-select"
            >
              <option value="">Choose...</option>
              <option value="fully-charged">Fully Charged ⚡</option>
              <option value="good">Good 💪</option>
              <option value="moderate">Moderate 🔋</option>
              <option value="low">Low 😴</option>
              <option value="exhausted">Exhausted 🪫</option>
            </select>
          </div>

          <div className="form-group support-section">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={checkInData.needsSupport}
                onChange={(e) => {
                  setCheckInData({
                    ...checkInData, 
                    needsSupport: e.target.checked,
                    supportNote: ''
                  });
                  if (e.target.checked) {
                    setShowSupportDialog(true);
                  }
                }}
                className="black-white-checkbox"
              />
              I would like to speak to a manager 🗣️
            </label>
          </div>

          {checkInData.needsSupport && (
            <>
              <div className="form-group">
                <label>Contact Preference</label>
                <select 
                  value={checkInData.contactPreference}
                  onChange={(e) => setCheckInData({...checkInData, contactPreference: e.target.value})}
                  required
                  className="black-white-select"
                >
                  <option value="">Choose...</option>
                  <option value="phone">Phone Call</option>
                  <option value="email">Email</option>
                  <option value="in-person">In Person</option>
                </select>
              </div>

              <div className="form-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={checkInData.urgent}
                    onChange={(e) => setCheckInData({...checkInData, urgent: e.target.checked})}
                    className="black-white-checkbox"
                  />
                  This is urgent and needs immediate attention
                </label>
              </div>
            </>
          )}

          <button type="submit" className="black-white-button submit-button">
            Submit Check-in
          </button>
        </form>
      </div>

      {/* Daily Debrief Form */}
      <div className="form-card">
        <h2>Daily Debrief</h2>
        <form onSubmit={handleDebriefSubmit}>
          <div className="form-group">
            <label>Shift Summary</label>
            <textarea
              value={debriefData.summary}
              onChange={(e) => setDebriefData({...debriefData, summary: e.target.value})}
              placeholder="How did your shift go today?"
              required
              className="black-white-input"
            />
          </div>

          <div className="form-group">
            <label>What Worked Well Today?</label>
            <textarea
              value={debriefData.whatWorkedWell}
              onChange={(e) => setDebriefData({...debriefData, whatWorkedWell: e.target.value})}
              placeholder="Share strategies or approaches that were successful..."
              className="black-white-input"
            />
          </div>

          <div className="form-group">
            <label>Category</label>
            <select 
              value={debriefData.category}
              onChange={(e) => setDebriefData({
                ...debriefData, 
                category: e.target.value,
                customCategory: ''
              })}
              required={debriefData.shareWithTeam}
              className="black-white-select"
            >
              <option value="">Select a category...</option>
              {STRATEGY_CATEGORIES.map(category => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </div>

          {debriefData.category === 'Other' && (
            <div className="form-group">
              <label>Specify Category</label>
              <input
                type="text"
                value={debriefData.customCategory}
                onChange={(e) => setDebriefData({
                  ...debriefData,
                  customCategory: e.target.value
                })}
                placeholder="Enter custom category"
                required
                className="black-white-input"
              />
            </div>
          )}

          <div className="form-group checkbox">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={debriefData.shareWithTeam}
                onChange={(e) => setDebriefData({...debriefData, shareWithTeam: e.target.checked})}
                className="black-white-checkbox"
              />
              Submit this strategy for manager review
            </label>
          </div>

          <button type="submit" className="black-white-button submit-button">
            Submit Debrief
          </button>
        </form>
      </div>
    </div>
  </div>
)}
{currentPage === 'resources' && (
  <div className="resources-page">
    <h2>External Resources</h2>
    <div className="resources-grid">
      {/* Mental Health Support Resources */}
      <div className="resource-card">
        <div className="resource-card-content">
          <h3>Anna Freud Centre</h3>
          <p>Mental health support and resources for professionals and young people.</p>
          <ul className="resource-links">
            <li>Professional Support Guidelines</li>
            <li>Youth Mental Health Resources</li>
            <li>Training Materials</li>
          </ul>
          <div className="resource-card-links">
            <a href="https://www.annafreud.org/" 
               target="_blank" 
               rel="noopener noreferrer" 
               className="black-white-button">
              Visit Website
            </a>
            <a href="https://www.annafreud.org/training/" 
               target="_blank" 
               rel="noopener noreferrer" 
               className="black-white-button secondary">
              Access Training
            </a>
          </div>
        </div>
      </div>

      <div className="resource-card">
        <div className="resource-card-content">
          <h3>YoungMinds</h3>
          <p>Mental health support and resources for young people.</p>
          <ul className="resource-links">
            <li>Crisis Support Information</li>
            <li>Professional Resources</li>
            <li>Best Practice Guidelines</li>
          </ul>
          <div className="resource-card-links">
            <a href="https://www.youngminds.org.uk/" 
               target="_blank" 
               rel="noopener noreferrer" 
               className="black-white-button">
              Visit Website
            </a>
            <a href="https://www.youngminds.org.uk/professional/" 
               target="_blank" 
               rel="noopener noreferrer" 
               className="black-white-button secondary">
              Professional Hub
            </a>
          </div>
        </div>
      </div>

      {/* Wellbeing Apps and Tools */}
      <div className="resource-card">
        <div className="resource-card-content">
          <h3>Headspace</h3>
          <p>Mindfulness and meditation app (included in vitality healthcare)</p>
          <ul className="resource-links">
            <li>Guided Meditations</li>
            <li>Sleep Stories</li>
            <li>Focus Music</li>
            <li>Movement Exercises</li>
          </ul>
          <div className="resource-card-links">
            <a href="https://www.headspace.com/" 
               target="_blank" 
               rel="noopener noreferrer" 
               className="black-white-button">
              Visit Website
            </a>
            <a href="https://work.headspace.com/login" 
               target="_blank" 
               rel="noopener noreferrer" 
               className="black-white-button secondary">
              Team Login
            </a>
          </div>
        </div>
      </div>

      {/* Updated Vitality Card */}
      <div className="resource-card">
        <div className="resource-card-content">
          <h3>Vitality.co.uk</h3>
          <p>Access Vitality Health resources.</p>
          <ul className="resource-links">
            <li>Vitality Rewards</li>
            <li>Health Insurance</li>
            <li>Life Insurance</li>
            <li>Vitality Community</li>
          </ul>
          <div className="resource-card-links">
            <a href="https://www.vitality.co.uk/" 
               target="_blank" 
               rel="noopener noreferrer" 
               className="black-white-button">
              Access Vitality Resources
            </a>
          </div>
        </div>
      </div>

      {/* Internal Training Resources */}
      <div className="resource-card">
        <div className="resource-card-content">
          <h3>My Tribe Training Materials</h3>
          <p>Internal resources and training materials for team development.</p>
          <ul className="resource-links">
            <li>Wellbeing Support Guidelines</li>
            <li>Team Building Activities</li>
            <li>Mental Health Awareness</li>
            <li>Support Pathway Documentation</li>
          </ul>
          <div className="resource-card-links">
            <a href="/training-hub" 
               className="black-white-button">
              Access Training Hub
            </a>
            <a href="/documentation" 
               className="black-white-button secondary">
              View Documentation
            </a>
          </div>
        </div>
      </div>

      {/* Support Documentation */}
      <div className="resource-card">
        <div className="resource-card-content">
          <h3>Support Documentation</h3>
          <p>Essential guidelines and documentation for wellbeing support.</p>
          <ul className="resource-links">
            <li>Emergency Response Procedures</li>
            <li>Risk Assessment Templates</li>
            <li>Referral Pathways</li>
            <li>Contact Information Directory</li>
          </ul>
          <div className="resource-card-links">
            <a href="/support-docs" 
               className="black-white-button">
              View Documents
            </a>
            <a href="/emergency-contacts" 
               className="black-white-button secondary">
              Emergency Contacts
            </a>
          </div>
        </div>
      </div>
    </div>
  </div>
)}

{currentPage === 'team' && (
  <div className="team-page">
    <h2>Team Page</h2>
    
    {/* Category filter */}
    <div className="category-filter">
      <select 
        onChange={(e) => setActiveCategory(e.target.value)}
        className="black-white-select"
      >
        <option value="">All Categories</option>
        {STRATEGY_CATEGORIES.filter(cat => cat !== 'Other').map(category => (
          <option key={category} value={category}>
            {category}
          </option>
        ))}
      </select>
    </div>
    
    {/* Strategies Section */}
    <div className="strategies-section">
      <h3>Successful Strategies</h3>
      <div className="strategies-grid">
        {approvedStrategies
          .filter(strategy => !activeCategory || strategy.category === activeCategory)
          .map(strategy => (
            <div key={strategy.id} className={`strategy-card ${strategy.highlighted ? 'highlighted' : ''}`}>
              <div className="strategy-header">
                <span className="category-badge">{strategy.category}</span>
                <span className="timestamp">
                  {new Date(strategy.timestamp?.seconds * 1000).toLocaleDateString()}
                </span>
              </div>
              <div className="strategy-content">
                <p>{strategy.content}</p>
              </div>
              {isManager && (
                <div className="strategy-actions">
                  <button 
                    onClick={() => handleStrategyReview(strategy.id, 'archive')}
                    className="black-white-button secondary"
                  >
                    Archive
                  </button>
                </div>
              )}
            </div>
          ))}
        {approvedStrategies.length === 0 && (
          <p className="no-data">No approved strategies yet</p>
        )}
      </div>
    </div>
  </div>
)}
{currentPage === 'wellbeing' && (
  <div className="wellbeing-page">
    <h2>My Wellbeing</h2>
    
    {/* Mood Overview Section */}
    <div className="mood-overview">
      <div className="info-card">
        <h3>Mood Tracking</h3>
        <div className="mood-chart">
          <div className="mood-timeline">
            {personalHistory
              .sort((a, b) => b.timestamp - a.timestamp)
              .slice(0, 7)
              .map(entry => (
                <div key={entry.id} className="mood-entry">
                  <div className="mood-date">
                    {new Date(entry.timestamp?.seconds * 1000).toLocaleDateString()}
                  </div>
                  <div className="mood-indicator">
                    <span className="mood-emoji">
                      {entry.mood === 'calm' && '😌'}
                      {entry.mood === 'happy' && '😊'}
                      {entry.mood === 'anxious' && '😰'}
                      {entry.mood === 'sad' && '😢'}
                      {entry.mood === 'angry' && '😠'}
                      {entry.mood === 'overwhelmed' && '😫'}
                      {entry.mood === 'numb' && '😐'}
                    </span>
                    <span className="mood-intensity">
                      Level: {entry.moodIntensity}
                    </span>
                  </div>
                  <div className="energy-level">
                    Energy: {entry.energyLevel}
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>

    {/* Check-in History */}
    <div className="checkin-history">
      <h3>My Check-in History</h3>
      <div className="history-grid">
        {personalHistory
          .sort((a, b) => b.timestamp - a.timestamp)
          .map(entry => (
            <div key={entry.id} className="history-card">
              <div className="history-header">
                <span className="history-date">
                  {new Date(entry.timestamp?.seconds * 1000).toLocaleDateString()}
                </span>
                {entry.needsSupport && (
                  <span className="support-requested">
                    Support Requested
                  </span>
                )}
              </div>
              <div className="history-content">
                <div className="mood-section">
                  <p>Mood: {entry.mood} {
                    entry.mood === 'calm' ? '😌' :
                    entry.mood === 'happy' ? '😊' :
                    entry.mood === 'anxious' ? '😰' :
                    entry.mood === 'sad' ? '😢' :
                    entry.mood === 'angry' ? '😠' :
                    entry.mood === 'overwhelmed' ? '😫' :
                    entry.mood === 'numb' ? '😐' : ''
                  }</p>
                  <p>Intensity: {entry.moodIntensity}</p>
                  <p>Energy Level: {entry.energyLevel}</p>
                </div>
                {entry.supportNote && (
                  <div className="support-note">
                    <p><strong>Support Note:</strong></p>
                    <p>{entry.supportNote}</p>
                  </div>
                )}
              </div>
            </div>
          ))}
      </div>
    </div>
  </div>
)}

{isManager && currentPage === 'manager' && (
  <div className="manager-dashboard">
    <div className="dashboard-tabs">
      <button 
        className={`tab-button ${activeManagerTab === 'support' ? 'active' : ''}`}
        onClick={() => setActiveManagerTab('support')}
      >
        Support Requests
        {notifications.support.length > 0 && (
          <span className="tab-badge">{notifications.support.length}</span>
        )}
      </button>
      <button 
        className={`tab-button ${activeManagerTab === 'handled' ? 'active' : ''}`}
        onClick={() => setActiveManagerTab('handled')}
      >
        Handled Requests
      </button>
      <button 
        className={`tab-button ${activeManagerTab === 'strategies' ? 'active' : ''}`}
        onClick={() => setActiveManagerTab('strategies')}
      >
        Strategy Reviews
        {notifications.strategies.length > 0 && (
          <span className="tab-badge">{notifications.strategies.length}</span>
        )}
      </button>
      <button 
        className={`tab-button ${activeManagerTab === 'archived' ? 'active' : ''}`}
        onClick={() => setActiveManagerTab('archived')}
      >
        Archived
      </button>
      <button 
        className={`tab-button ${activeManagerTab === 'oncall' ? 'active' : ''}`}
        onClick={() => setActiveManagerTab('oncall')}
      >
        On-Call Schedule
      </button>
      <button 
        className={`tab-button ${activeManagerTab === 'monthly-focus' ? 'active' : ''}`}
        onClick={() => setActiveManagerTab('monthly-focus')}
      >
        Monthly Focus
      </button>
    </div>

    <div className="tab-content">
      {activeManagerTab === 'support' && (
        <div className="support-requests-section">
          <h3>Current Support Requests</h3>
          <div className="requests-grid">
            {pendingSupport.length === 0 ? (
              <p className="no-data">No pending support requests</p>
            ) : (
              pendingSupport.map(request => (
                <div key={request.id} className="request-card">
                  <div className="request-header">
                    <span className="timestamp">
                      {new Date(request.timestamp?.seconds * 1000).toLocaleDateString()}
                    </span>
                    {request.urgent && (
                      <span className="urgent-badge">URGENT</span>
                    )}
                  </div>
                  <div className="request-content">
                    <p><strong>From:</strong> {request.userEmail}</p>
                    <p><strong>Mood:</strong> {request.mood}</p>
                    <p><strong>Energy:</strong> {request.energyLevel}</p>
                    <p><strong>Contact Preference:</strong> {request.contactPreference}</p>
                    <p><strong>Notes:</strong> {request.supportNote}</p>
                  </div>
                  <div className="request-actions">
                    <button 
                      onClick={() => handleSupportRequest(request.id)}
                      className="black-white-button"
                    >
                      Mark as Handled
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {activeManagerTab === 'handled' && (
        <div className="handled-requests-section">
          <h3>Handled Support Requests</h3>
          <div className="requests-grid">
            {handledTickets.length === 0 ? (
              <p className="no-data">No handled requests</p>
            ) : (
              handledTickets.map(ticket => (
                <div key={ticket.id} className="handled-request-card">
                  <div className="handled-header">
                    <span className="timestamp">
                      Handled: {new Date(ticket.handledAt).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="handled-content">
                    <div className="handled-info">
                      <p><strong>From:</strong> {ticket.userEmail}</p>
                      <p><strong>Request Type:</strong> {ticket.mood} / {ticket.energyLevel}</p>
                      <p><strong>Handled By:</strong> {ticket.handledBy}</p>
                    </div>
                    {ticket.supportNote && (
                      <div className="handled-note">
                        <p>{ticket.supportNote}</p>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {activeManagerTab === 'strategies' && (
        <div className="strategy-reviews-section">
          <h3>Strategies to Review</h3>
          <div className="strategies-grid">
            {pendingStrategies.length === 0 ? (
              <p className="no-data">No strategies to review</p>
            ) : (
              pendingStrategies.map(strategy => (
                <div key={strategy.id} className="strategy-card">
                  <div className="strategy-header">
                    <span>From: {strategy.userEmail}</span>
                    <span className="timestamp">
                      {new Date(strategy.timestamp?.seconds * 1000).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="strategy-content">
                    <p><strong>Category:</strong> {strategy.category}</p>
                    <p>{strategy.content}</p>
                  </div>
                  <div className="strategy-actions">
                    <button 
                      onClick={() => handleStrategyReview(strategy.id, 'approve', true)}
                      className="black-white-button"
                    >
                      Approve & Highlight
                    </button>
                    <button 
                      onClick={() => handleStrategyReview(strategy.id, 'approve', false)}
                      className="black-white-button"
                    >
                      Approve
                    </button>
                    <button 
                      onClick={() => handleStrategyReview(strategy.id, 'archive')}
                      className="black-white-button secondary"
                    >
                      Archive
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {activeManagerTab === 'oncall' && (
        <div className="oncall-section">
          <h3>On-Call Schedule</h3>
          
          {/* Create New Schedule Section */}
          <div className="create-week-container">
            <h4>Create New Schedule</h4>
            <div className="week-picker">
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => handleDateSelection(e.target.value)}
                className="black-white-input"
              />
              <button 
                className="black-white-button"
                onClick={() => {
                  if (!weeklySchedule.weekDates.startDate) {
                    alert('Please select a week first');
                    return;
                  }
                  updateWeeklySchedule(weeklySchedule);
                }}
              >
                Create Schedule
              </button>
            </div>
          </div>

          {/* Week Navigation */}
          <div className="oncall-controls">
            <div className="week-navigation">
              <button 
                className="black-white-button"
                onClick={() => {
                  const currentIndex = weeklySchedules.findIndex(s => s.id === selectedWeek);
                  if (currentIndex < weeklySchedules.length - 1) {
                    setWeeklySchedule(weeklySchedules[currentIndex + 1]);
                    setSelectedWeek(weeklySchedules[currentIndex + 1].id);
                  }
                }}
              >
                Previous Week
              </button>
              <div className="current-week">
                {weeklySchedule.weekDates.startDate && (
                  <span>
                    Week of {new Date(weeklySchedule.weekDates.startDate).toLocaleDateString()}
                  </span>
                )}
              </div>
              <button 
                className="black-white-button"
                onClick={() => {
                  const currentIndex = weeklySchedules.findIndex(s => s.id === selectedWeek);
                  if (currentIndex > 0) {
                    setWeeklySchedule(weeklySchedules[currentIndex - 1]);
                    setSelectedWeek(weeklySchedules[currentIndex - 1].id);
                  }
                }}
              >
                Next Week
              </button>
            </div>

            {selectedWeek && (
              <button 
                className="black-white-button secondary"
                onClick={() => deleteSchedule(selectedWeek)}
              >
                Delete Schedule
              </button>
            )}
          </div>

          {/* Week Selection Dropdown */}
          <div className="week-quick-select">
            <select 
              className="black-white-select"
              value={selectedWeek || ''}
              onChange={(e) => {
                const selected = weeklySchedules.find(w => w.id === e.target.value);
                if (selected) {
                  setWeeklySchedule(selected);
                  setSelectedWeek(selected.id);
                }
              }}
            >
              <option value="">Select a week...</option>
              {weeklySchedules
                .sort((a, b) => new Date(b.weekDates.startDate) - new Date(a.weekDates.startDate))
                .map(schedule => (
                  <option key={schedule.id} value={schedule.id}>
                    Week of {new Date(schedule.weekDates.startDate).toLocaleDateString()}
                  </option>
                ))}
            </select>
          </div>
          {/* On-Call Schedule Form */}
          <form onSubmit={(e) => {
            e.preventDefault();
            updateWeeklySchedule(weeklySchedule);
          }} className="schedule-form">
            <div className="schedule-grid">
              {ORDERED_DAYS.map(day => {
                const schedule = weeklySchedule.days[day];
                const isToday = new Date().toLocaleDateString('en-US', { weekday: 'long' }) === day;
                return (
                  <div key={day} className={`day-schedule ${isToday ? 'current-day' : ''}`}>
                    <h4>{day}</h4>
                    <div className="schedule-inputs">
                      <input
                        type="text"
                        placeholder="Name"
                        value={schedule?.name || ''}
                        onChange={(e) => setWeeklySchedule({
                          ...weeklySchedule,
                          days: {
                            ...weeklySchedule.days,
                            [day]: { 
                              ...weeklySchedule.days[day],
                              name: e.target.value 
                            }
                          }
                        })}
                        className="black-white-input"
                      />
                      <input
                        type="tel"
                        placeholder="Phone"
                        value={schedule?.phone || ''}
                        onChange={(e) => setWeeklySchedule({
                          ...weeklySchedule,
                          days: {
                            ...weeklySchedule.days,
                            [day]: { 
                              ...weeklySchedule.days[day],
                              phone: e.target.value 
                            }
                          }
                        })}
                        className="black-white-input"
                      />
                      <input
                        type="text"
                        placeholder="Hours"
                        value={schedule?.hours || ''}
                        onChange={(e) => setWeeklySchedule({
                          ...weeklySchedule,
                          days: {
                            ...weeklySchedule.days,
                            [day]: { 
                              ...weeklySchedule.days[day],
                              hours: e.target.value 
                            }
                          }
                        })}
                        className="black-white-input"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            
            <button type="submit" className="black-white-button submit-button">
              Save Schedule
            </button>
          </form>
        </div>
      )}

      {activeManagerTab === 'monthly-focus' && (
        <div className="monthly-focus-section info-card">
          <h3>Set Monthly Focus</h3>
          <form onSubmit={async (e) => {
            e.preventDefault();
            try {
              // Deactivate current monthly focus
              const currentFocusQuery = query(
                collection(db, 'monthlyFocus'),
                where('active', '==', true)
              );
              const currentFocusDocs = await getDocs(currentFocusQuery);
              const batch = writeBatch(db);
              
              currentFocusDocs.forEach((doc) => {
                batch.update(doc.ref, { active: false });
              });

              // Add new monthly focus
              const newFocusRef = doc(collection(db, 'monthlyFocus'));
              batch.set(newFocusRef, {
                ...newMonthlyFocus,
                createdAt: serverTimestamp(),
                createdBy: currentUser.uid
              });

              await batch.commit();

              setNewMonthlyFocus({
                title: '',
                description: '',
                month: new Date().toISOString().slice(0, 7),
                active: true
              });
              alert('Monthly focus updated successfully');
            } catch (error) {
              console.error('Error setting monthly focus:', error);
              alert('Error updating monthly focus');
            }
          }}>
            <div className="form-group">
              <label>Month</label>
              <input
                type="month"
                value={newMonthlyFocus.month}
                onChange={(e) => setNewMonthlyFocus({
                  ...newMonthlyFocus,
                  month: e.target.value
                })}
                required
                className="black-white-input"
              />
            </div>
            <div className="form-group">
              <label>Title</label>
              <input
                type="text"
                value={newMonthlyFocus.title}
                onChange={(e) => setNewMonthlyFocus({
                  ...newMonthlyFocus,
                  title: e.target.value
                })}
                required
                className="black-white-input"
              />
            </div>
            <div className="form-group">
              <label>Description</label>
              <textarea
                value={newMonthlyFocus.description}
                onChange={(e) => setNewMonthlyFocus({
                  ...newMonthlyFocus,
                  description: e.target.value
                })}
                required
                className="black-white-input"
              />
            </div>
            <button type="submit" className="black-white-button submit-button">
              Set Monthly Focus
            </button>
          </form>
        </div>
      )}
    </div>
  </div>
)}
{isManager && currentPage === 'team-overview' && (
  <div className="team-overview-page">
    <h2>Team Overview</h2>

    {/* Team Mood Summary */}
    <div className="mood-summary info-card">
      <h3>Team Mood Overview</h3>
      <div className="mood-summary-grid">
        <div className="summary-card">
          <h4>Today's Check-ins</h4>
          <div className="mood-distribution">
            {Object.entries(
              teamHistory
                .filter(entry => {
                  const today = new Date();
                  const entryDate = new Date(entry.timestamp?.seconds * 1000);
                  return entryDate.toDateString() === today.toDateString();
                })
                .reduce((acc, entry) => {
                  acc[entry.mood] = (acc[entry.mood] || 0) + 1;
                  return acc;
                }, {})
            ).map(([mood, count]) => (
              <div key={mood} className="mood-stat">
                <span className="mood-emoji">
                  {mood === 'calm' && '😌'}
                  {mood === 'happy' && '😊'}
                  {mood === 'anxious' && '😰'}
                  {mood === 'sad' && '😢'}
                  {mood === 'angry' && '😠'}
                  {mood === 'overwhelmed' && '😫'}
                  {mood === 'numb' && '😐'}
                </span>
                <span className="mood-count">{count}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="summary-card">
          <h4>Support Requests</h4>
          <div className="support-stats">
            <div className="stat">
              <span className="stat-label">Active</span>
              <span className="stat-value">{pendingSupport.length}</span>
            </div>
            <div className="stat">
              <span className="stat-label">Last 7 Days</span>
              <span className="stat-value">
                {handledTickets.filter(ticket => {
                  const weekAgo = new Date();
                  weekAgo.setDate(weekAgo.getDate() - 7);
                  return new Date(ticket.handledAt) > weekAgo;
                }).length}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    {/* Team Members Section with Selection */}
    <div className="team-members-section">
      <h3>Team Members</h3>
      {Object.entries(
        teamHistory.reduce((acc, entry) => {
          if (!acc[entry.userEmail]) {
            acc[entry.userEmail] = [];
          }
          acc[entry.userEmail].push(entry);
          return acc;
        }, {})
      ).map(([email, entries]) => (
        <div key={email} className="member-card info-card">
          <div className="member-header">
            <button 
              className={`black-white-button ${selectedTeamMember === email ? 'active' : ''}`}
              onClick={() => setSelectedTeamMember(email === selectedTeamMember ? null : email)}
            >
              {email.split('@')[0]}
              <span className="check-in-count">
                {entries.length} check-ins
              </span>
            </button>
          </div>
          
          {selectedTeamMember === email && (
            <>
              <div className="mood-timeline">
                {entries
                  .sort((a, b) => b.timestamp - a.timestamp)
                  .slice(0, 7)
                  .map(entry => (
                    <div key={entry.id} className="mood-entry">
                      <div className="mood-date">
                        {new Date(entry.timestamp?.seconds * 1000).toLocaleDateString()}
                      </div>
                      <div className="mood-indicator">
                        <span className="mood-emoji">
                          {entry.mood === 'calm' && '😌'}
                          {entry.mood === 'happy' && '😊'}
                          {entry.mood === 'anxious' && '😰'}
                          {entry.mood === 'sad' && '😢'}
                          {entry.mood === 'angry' && '😠'}
                          {entry.mood === 'overwhelmed' && '😫'}
                          {entry.mood === 'numb' && '😐'}
                        </span>
                        <span className="mood-intensity">
                          Level: {entry.moodIntensity}
                        </span>
                      </div>
                      {entry.needsSupport && (
                        <div className="support-indicator">
                          Requested Support
                        </div>
                      )}
                    </div>
                  ))}
              </div>

              <div className="member-stats">
                <div className="stat">
                  <span className="stat-label">Support Requests</span>
                  <span className="stat-value">
                    {entries.filter(entry => entry.needsSupport).length}
                  </span>
                </div>
                <div className="stat">
                  <span className="stat-label">Recent Mood</span>
                  <span className="stat-value">
                    {entries[0]?.mood || 'No data'}
                  </span>
                </div>
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  </div>
)}

{/* Support Dialog */}
{showSupportDialog && (
  <div className="dialog-overlay">
    <div className="dialog-card">
      <h3>Request Manager Support</h3>
      <div className="form-group">
        <label>Please briefly explain what's going on:</label>
        <textarea
          value={checkInData.supportNote}
          onChange={(e) => setCheckInData({...checkInData, supportNote: e.target.value})}
          placeholder="Share what you'd like to discuss..."
          required
          className="black-white-input"
        />
      </div>
      <div className="dialog-actions">
        <button 
          onClick={() => {
            setCheckInData({...checkInData, needsSupport: false});
            setShowSupportDialog(false);
          }}
          className="black-white-button secondary"
        >
          Cancel
        </button>
        <button 
          onClick={() => setShowSupportDialog(false)}
          className="black-white-button"
        >
          Continue
        </button>
      </div>
    </div>
  </div>
)}
        </>
      ) : (
        <div className="login-message">
          <h2>Please log in to access My Tribe Connect</h2>
        </div>
      )}
    </main>
  </div>
);
}

export default App;
