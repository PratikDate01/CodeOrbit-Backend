const Attendance = require("../models/Attendance");
const InternshipApplication = require("../models/InternshipApplication");
const asyncHandler = require("../middleware/asyncHandler");

// Helper: Calculate working days (Mon-Fri) between two dates
const calculateWorkingDays = (startDate, endDate) => {
  let count = 0;
  let curDate = new Date(startDate);
  const end = new Date(endDate);
  
  // Set to midnight for consistent comparison
  curDate.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);

  while (curDate <= end) {
    const dayOfWeek = curDate.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) { // 0: Sunday, 6: Saturday
      count++;
    }
    curDate.setDate(curDate.getDate() + 1);
  }
  return count;
};

// @desc    Get attendance for a student
// @route   GET /api/attendance/:internshipId
// @access  Private/Admin
const getAttendance = asyncHandler(async (req, res) => {
  const attendance = await Attendance.findOne({ internshipId: req.params.internshipId });
  res.json(attendance || null);
});

// @desc    Save or update attendance
// @route   POST /api/attendance
// @access  Private/Admin
const saveAttendance = asyncHandler(async (req, res) => {
  const { internshipId, weeklyPresentDays } = req.body;

  if (!internshipId || !Array.isArray(weeklyPresentDays)) {
    res.status(400);
    throw new Error("Invalid request data");
  }

  const application = await InternshipApplication.findById(internshipId);
  if (!application) {
    res.status(404);
    throw new Error("Internship application not found");
  }

  const startDate = new Date(application.startDate);
  const endDate = new Date(application.endDate);
  
  let weeks = [];
  let totalPresentDays = 0;
  let totalWorkingDays = 0;

  // Process each week based on the input array
  for (let i = 0; i < weeklyPresentDays.length; i++) {
    const weekStart = new Date(startDate);
    weekStart.setDate(startDate.getDate() + (i * 7));
    
    let weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    
    // If weekEnd exceeds application endDate, cap it
    if (weekEnd > endDate) {
      weekEnd = new Date(endDate);
    }

    // If weekStart is already past endDate, don't process further weeks
    if (weekStart > endDate) break;

    const workingDaysInWeek = calculateWorkingDays(weekStart, weekEnd);
    const presentDays = Math.max(0, Number(weeklyPresentDays[i]) || 0);

    if (presentDays > workingDaysInWeek) {
      res.status(400);
      throw new Error(`Week ${i + 1}: Present days (${presentDays}) cannot exceed working days (${workingDaysInWeek})`);
    }

    const percentage = workingDaysInWeek > 0 ? (presentDays / workingDaysInWeek) * 100 : 0;

    weeks.push({
      weekNumber: i + 1,
      presentDays,
      totalDays: workingDaysInWeek,
      percentage: Math.round(percentage * 10) / 10 // Round to 1 decimal
    });

    totalPresentDays += presentDays;
    totalWorkingDays += workingDaysInWeek;
  }

  const overallPercentage = totalWorkingDays > 0 ? (totalPresentDays / totalWorkingDays) * 100 : 0;
  
  let status = "Poor";
  if (overallPercentage >= 90) status = "Excellent";
  else if (overallPercentage >= 75) status = "Good";
  else if (overallPercentage >= 60) status = "Average";

  const attendanceData = {
    userId: application.user,
    internshipId,
    weeks,
    totalPresentDays,
    totalWorkingDays,
    overallPercentage: Math.round(overallPercentage * 10) / 10,
    status
  };

  let attendance = await Attendance.findOne({ internshipId });

  if (attendance) {
    attendance = await Attendance.findOneAndUpdate(
      { internshipId },
      attendanceData,
      { new: true }
    );
  } else {
    attendance = await Attendance.create(attendanceData);
  }

  res.status(201).json(attendance);
});

module.exports = {
  getAttendance,
  saveAttendance
};
