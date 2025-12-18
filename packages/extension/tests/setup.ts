/**
 * Jest Test Setup
 * Mocks Chrome Extension APIs for testing
 */

import { jest, beforeEach } from '@jest/globals';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Callback = (...args: any[]) => void;

// Mock chrome APIs
global.chrome = {
  storage: {
    local: {
      get: jest.fn((_keys: any, callback?: Callback) => {
        if (callback) callback({});
        return Promise.resolve({});
      }) as any,
      set: jest.fn((_items: any, callback?: Callback) => {
        if (callback) callback();
        return Promise.resolve();
      }) as any,
      remove: jest.fn((_keys: any, callback?: Callback) => {
        if (callback) callback();
        return Promise.resolve();
      }) as any,
      clear: jest.fn((callback?: Callback) => {
        if (callback) callback();
        return Promise.resolve();
      }) as any
    },
    onChanged: {
      addListener: jest.fn() as any,
      removeListener: jest.fn() as any
    }
  },
  runtime: {
    sendMessage: jest.fn((_message: any, callback?: Callback) => {
      if (callback) callback({});
      return Promise.resolve({});
    }) as any,
    onMessage: {
      addListener: jest.fn() as any,
      removeListener: jest.fn() as any
    },
    onInstalled: {
      addListener: jest.fn() as any
    },
    onStartup: {
      addListener: jest.fn() as any
    },
    getManifest: jest.fn(() => ({
      version: '1.0.0',
      name: 'WorkTime Test'
    })) as any,
    lastError: null,
    id: 'test-extension-id'
  },
  tabs: {
    query: jest.fn((_queryInfo: any, callback?: Callback) => {
      if (callback) callback([]);
      return Promise.resolve([]);
    }) as any,
    get: jest.fn((_tabId: any, callback?: Callback) => {
      if (callback) callback({});
      return Promise.resolve({});
    }) as any,
    onActivated: {
      addListener: jest.fn() as any,
      removeListener: jest.fn() as any
    },
    onUpdated: {
      addListener: jest.fn() as any,
      removeListener: jest.fn() as any
    },
    onRemoved: {
      addListener: jest.fn() as any,
      removeListener: jest.fn() as any
    }
  },
  alarms: {
    create: jest.fn((_name: any, _alarmInfo: any) => {
      return Promise.resolve();
    }) as any,
    clear: jest.fn((_name: any, callback?: Callback) => {
      if (callback) callback(true);
      return Promise.resolve(true);
    }) as any,
    get: jest.fn((_name: any, callback?: Callback) => {
      if (callback) callback(null);
      return Promise.resolve(null);
    }) as any,
    onAlarm: {
      addListener: jest.fn() as any,
      removeListener: jest.fn() as any
    }
  },
  idle: {
    setDetectionInterval: jest.fn() as any,
    queryState: jest.fn((_detectionIntervalInSeconds: any, callback?: Callback) => {
      if (callback) callback('active');
      return Promise.resolve('active');
    }) as any,
    onStateChanged: {
      addListener: jest.fn() as any,
      removeListener: jest.fn() as any
    }
  },
  identity: {
    launchWebAuthFlow: jest.fn((_details: any, callback?: Callback) => {
      const mockUrl = 'https://test.chromiumapp.org/?code=mock_auth_code';
      if (callback) callback(mockUrl);
      return Promise.resolve(mockUrl);
    }) as any,
    getRedirectURL: jest.fn((_path?: any) => {
      return `https://test.chromiumapp.org/${_path || ''}`;
    }) as any
  },
  action: {
    setBadgeText: jest.fn((_details: any, callback?: Callback) => {
      if (callback) callback();
      return Promise.resolve();
    }) as any,
    setBadgeBackgroundColor: jest.fn((_details: any, callback?: Callback) => {
      if (callback) callback();
      return Promise.resolve();
    }) as any,
    setIcon: jest.fn((_details: any, callback?: Callback) => {
      if (callback) callback();
      return Promise.resolve();
    }) as any
  }
} as any;

// Mock DOM APIs
global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(''),
    headers: new Headers()
  } as Response)
);

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    get length() {
      return Object.keys(store).length;
    },
    key: (index: number) => {
      const keys = Object.keys(store);
      return keys[index] || null;
    }
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock
});

// Reset mocks before each test
beforeEach(() => {
  jest.clearAllMocks();
  localStorageMock.clear();
});
