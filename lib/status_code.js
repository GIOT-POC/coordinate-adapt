
module.exports = {

  COMMAND_SUCCESS: {
    code: 1200,
    message: 'Command succeeded'
  },
  PHONE_EXIST: {
    code: 1216,
    message: 'User phone number does exist'
  },
  CREATE_DEVICE_SUCCESS: {
    code: 1222,
    message: 'Device created successful'
  },
  CREATE_USER_BUT_NO_KEYSTORE: {
    code: 1235,
    message: 'Create user but no keystore'
  },
  SMS_SUCCESS: {
    code: 1237,
    message: 'SMS request success'
  },
  USER_NOT_EXIST: {
    code: 1415,
    message: 'User does not exist'
  },
  RELOGIN: {
    code: 1427,
    message: 'Token is revoked because client re-login'
  },
  LOGIN_FAIL: {
    code: 1435,
    message: 'LOGIN failed'
  },
  CREATE_USER_WITH_KEYSTOR: {
    code: 1236,
    message: 'Create user with keystore'
  },
  REQUEST_EMAIL_VALIDATION: {
    code: 1238,
    message: 'Email validation request success'
  },
  EMAIL_VALIDATION_SUCCESS: {
    code: 1239,
    message: 'Email validation success'
  },
  MISSING_PARAMETER: {
    code: 1400,
    message: 'Missing or error parameters'
  },
  DB_CONNECTION_FAIL: {
    code: 1401,
    message: 'DB Connection fail'
  },
  GET_PROFILE_FAIL: {
    code: 1402,
    message: 'DB API Connection fail'
  },
  SESSION_MGR_ERROR: {
    code: 1403,
    message: 'session mgr error'
  },
  CERT_SERVER_ERROR: {
    code: 1404,
    message: 'Cert Server fail'
  },
  MSG_SERVER_ERROR: {
    code: 1406,
    message: 'MSG Server fail'
  },
  CACHE_SERVER_FAIL: {
    code: 1407,
    message: 'Cache server error'
  },
  USER_GET_FAIL: {
    code: 1411,
    message: 'User got fail'
  },
  USER_PHONE_NOT_EXIST: {
    code: 1418,
    message: 'User phone number does not exist'
  },
  REQUEST_EMAIL_VALIDATION_FAIL: {
    code: 1421,
    message: 'Request Email Validation Fail'
  },
  CERT_IS_REVOKED: {
    code: 1422,
    message: 'The certificate has been revoked'
  },
  EMAIL_NOT_MATCH: {
    code: 1423,
    message: 'Email is not matched!'
  },
  RESET_PWD_CODE_INVALID: {
    code: 1424,
    message: 'The code for resetting password is invalid.'
  },
  EMAIL_NOT_VERIFIED: {
    code: 1428,
    message: 'Email is not verified!'
  },
  EMAIL_NOT_FOUND: {
    code: 1429,
    message: 'Email Domain cannot be resolved!'
  },
  CODE_INVALID: {
    code: 1430,
    message: 'validation code not correct'
  },
  SESSION_INVALID: {
    code: 1431,
    message: 'session invalid'
  },
  PHONE_VALIDATE_FAILURE: {
    code: 1432,
    message: 'Fail to validate phone number'
  },
  DEVELOPER_KEY_AUTH_FAIL: {
    code: 1434,
    message: 'API Key Authorization Fail'
  },
  EMAIL_VALIDATION_FAIL: {
    code: 1437,
    message: 'Email Validation Fail'
  },
  VENDOR_CERT_INVALID: {
    code: 1438,
    message: 'Vendor certifcate is invalid'
  },
  DEVICE_CREATE_FAIL: {
    code: 1461,
    message: 'Device created fail'
  },
  MODELNAME_ERROR: {
    code: 1470,
    message: 'Model name is incorrect'
  },
  PROJECTNAME_ERROR: {
    code: 1471,
    message: 'Project name is incorrect'
  },
  PRODUCTION_LIMIT_NOT_SET: {
    code: 1472,
    message: 'PRODUCTION LIMIT NOT SET'
  },
  REACH_PRODUCTION_LIMIT: {
    code: 1473,
    message: 'Reach Production Limitation'
  },
  NO_ORDER_DATA: {
    code: 1601,
    message: 'No order'
  },
  SERVICE_REACHED_UPPER_LIMIT: {
    code: 1603,
    message: 'Service already reached the upper limit'
  },
  ORDER_IS_EXIST_IN_DB: {
    code: 1604,
    message: 'Order is already exist'
  },
  SERVER_INTERNAL_ERROR: {
    code: 1500,
    message: 'Server internal error'
  },
  DATA_UPLOAD_FAIL: {
    code: 1502,
    message: 'Data upload fail'
  },
  PIN_CODE_EXPIRE: {
    code: 1700,
    message: 'Pin code expired'
  },
  PHONE_FORMAT_ERROR: {
    code: 1701,
    message: 'Phone format error'
  }
};
