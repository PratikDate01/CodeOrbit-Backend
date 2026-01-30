const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const User = require("../models/User");

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL,
      proxy: true,
      userProfileURL: "https://www.googleapis.com/oauth2/v3/userinfo",
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        if (!profile || !profile.emails || !profile.emails[0]) {
          return done(new Error("No email found in Google profile"), null);
        }

        const email = profile.emails[0].value;
        const name = profile.displayName || "Google User";
        const googleId = profile.id;

        let user = await User.findOne({ email });

        if (user) {
          if (!user.googleId) {
            user.googleId = googleId;
            await user.save();
          }
          return done(null, user);
        } else {
          user = await User.create({
            name,
            email,
            googleId,
            role: email === process.env.ADMIN_EMAIL ? "admin" : "client",
          });
          return done(null, user);
        }
      } catch (error) {
        console.error("Passport Google Strategy Error:", error);
        return done(error, null);
      }
    }
  )
);

// We don't need serialize/deserialize if we are using JWT, 
// but passport might require them if session is true.
// We will use session: false in the route.
passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});
