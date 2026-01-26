const Application = require("../models/Application");
const mongoose = require("mongoose");

// @desc    Create new application
// @route   POST /api/applications
// @access  Private (Client)
const createApplication = async (req, res, next) => {
  try {
    const { internshipTitle, resume, message } = req.body;

    const application = new Application({
      user: req.user._id,
      internshipTitle,
      resume,
      message,
    });

    const createdApplication = await application.save();
    res.status(201).json(createdApplication);
  } catch (error) {
    next(error);
  }
};

// @desc    Get logged in user applications
// @route   GET /api/applications/my-applications
// @access  Private (Client)
const getMyApplications = async (req, res, next) => {
  try {
    const applications = await Application.find({ user: req.user._id }).sort({ createdAt: -1 });
    res.json(applications);
  } catch (error) {
    next(error);
  }
};

// @desc    Get all applications
// @route   GET /api/applications
// @access  Private (Admin)
const getApplications = async (req, res, next) => {
  try {
    console.log("Fetching all applications...");
    const applications = await Application.find({}).populate("user", "name email");
    console.log(`Found ${applications.length} applications`);
    res.json(applications);
  } catch (error) {
    console.error("Error in getApplications:", error);
    next(error);
  }
};

// @desc    Update application status
// @route   PUT /api/applications/:id
// @access  Private (Admin)
const updateApplicationStatus = async (req, res, next) => {
  try {
    const { status } = req.body;

    const application = await Application.findById(req.params.id);

    if (application) {
      application.status = status;
      const updatedApplication = await application.save();
      res.json(updatedApplication);
    } else {
      res.status(404);
      throw new Error("Application not found");
    }
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createApplication,
  getMyApplications,
  getApplications,
  updateApplicationStatus,
};
