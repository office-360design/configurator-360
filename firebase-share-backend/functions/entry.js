'use strict';

// Keep the long-lived backend untouched and compose new feature modules around
// it. This prevents isolated feature work from overwriting newer tenant,
// analytics, metering, cart, or contact-mail functions in index.js.
module.exports = {
  ...require('./index.js'),
  ...require('./quotation.js'),
  ...require('./profile.js'),
};
