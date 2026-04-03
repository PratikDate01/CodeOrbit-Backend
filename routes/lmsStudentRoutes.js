const express = require("express");
const router = express.Router();
const {
  getMyEnrollments,
  getProgramDetails,
  getCourseContent,
  updateActivityProgress,
  submitQuiz,
  getActivityById,
} = require("../controllers/lmsStudentController");
const { 
  createActivity,
  updateActivity 
} = require("../controllers/lmsAdminController");
const { protect, admin } = require("../middleware/authMiddleware");

router.use(protect);

router.get("/my-enrollments", getMyEnrollments);
router.get("/programs/:id", getProgramDetails);
router.get("/courses/:courseId/content", getCourseContent);
router.get("/activities/:id", getActivityById);
router.post("/activities/:id/progress", updateActivityProgress);
router.post("/activities", admin, createActivity);
router.put("/activities/:id", admin, updateActivity);
router.post("/quiz/submit", submitQuiz);
router.post("/activities/:id/submit-quiz", submitQuiz); // Backward compatibility

module.exports = router;
