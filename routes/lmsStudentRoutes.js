const express = require("express");
const router = express.Router();
const {
  getMyEnrollments,
  getProgramDetails,
  getCourseContent,
  updateActivityProgress,
  submitQuiz,
} = require("../controllers/lmsStudentController");
const { protect } = require("../middleware/authMiddleware");

router.use(protect);

router.get("/my-enrollments", getMyEnrollments);
router.get("/programs/:id", getProgramDetails);
router.get("/courses/:courseId/content", getCourseContent);
router.post("/activities/:id/progress", updateActivityProgress);
router.post("/activities/:id/submit-quiz", submitQuiz);

module.exports = router;
