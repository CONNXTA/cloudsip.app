export const defaultConfig = {
  companyWebsite: 'www.connxta.com',
  sip: {
    extension: 'DEMOX',
    sipDomain: 'sip.domain.com',
    websocketUrl: 'wss://sip.domain.com:8089/ws',
    sipUri: 'sip:DEMO@sip.domain.com',
    displayName: 'DEMO',
    password: 'DEMOPASS',
    iceServers: [],
    sessionTimers: true,
    reconnectMinSeconds: 2,
    reconnectMaxSeconds: 30
  },
  settings: {
    autoAnswer: false,
    autoHoldOnSwitch: true,
    autoRecordCalls: false,
    theme: 'light'
  }
};
