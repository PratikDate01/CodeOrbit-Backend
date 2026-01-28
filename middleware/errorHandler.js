const errorHandler = (err, req, res, _next) => {
  // Log the error for server-side debugging
  console.error(`Error: ${err.message}`);
  console.error(err.stack);

  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  res.status(statusCode);
  res.json({
    message: err.message,
    stack: process.env.NODE_ENV === "production" ? null : err.stack,
  });
};

module.exports = errorHandler;
