const axios = require('axios');

axios.defaults.headers.common['Accept-Language'] = 'en-US, en';
axios.defaults.headers.common['User-Agent'] =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/86.0.4240.111 Safari/537.36';

module.exports = axios;
