'use strict';

// Keep the long-lived backend untouched and compose new feature modules around
// it. Feature-specific compatibility layers are spread last so they can safely
// override one callable without replacing unrelated backend functionality.
module.exports = {
  ...require('./index.js?v=platform-18'),
  ...require('./quotation.js?v=platform-18'),
  ...require('./profile.js?v=platform-18'),
  ...require('./sales-dashboard.js?v=platform-18'),
  ...require('./profile-update.js?v=platform-18'),
};
