import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the ENV module
vi.mock('../server/_core/env', () => ({
  ENV: {
    forgeApiUrl: 'https://mock-forge-api.example.com',
    forgeApiKey: 'mock-api-key',
    appId: 'test-app',
    cookieSecret: 'test-secret',
    databaseUrl: 'test-db',
    oAuthServerUrl: 'test-oauth',
    ownerOpenId: 'test-owner',
    isProduction: false,
    elevenLabsApiKey: '',
  },
}));

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { transcribeAudioBuffer } from '../server/_core/voiceTranscription';

describe('transcribeAudioBuffer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns transcript for valid audio', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        task: 'transcribe',
        language: 'en',
        duration: 5.0,
        text: 'Today I went for a run and felt great.',
        segments: [],
      }),
    });

    const fakeAudioBuffer = Buffer.from('fake-audio-data');
    const result = await transcribeAudioBuffer(fakeAudioBuffer, 'audio/m4a', {
      language: 'en',
      prompt: 'Personal journal entry',
    });

    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.text).toBe('Today I went for a run and felt great.');
      expect(result.language).toBe('en');
    }
  });

  it('returns empty transcript for silent audio', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        task: 'transcribe',
        language: 'en',
        duration: 1.0,
        text: '',
        segments: [],
      }),
    });

    const fakeAudioBuffer = Buffer.from('silent-audio');
    const result = await transcribeAudioBuffer(fakeAudioBuffer, 'audio/wav');

    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.text).toBe('');
    }
  });

  it('returns error when Whisper API returns 400', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      text: async () => JSON.stringify({ error: { message: 'Invalid file format' } }),
    });

    const fakeAudioBuffer = Buffer.from('not-audio');
    const result = await transcribeAudioBuffer(fakeAudioBuffer, 'audio/m4a');

    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error).toBe('Transcription service request failed');
      expect(result.code).toBe('TRANSCRIPTION_FAILED');
    }
  });

  it('returns error when file exceeds 16MB limit', async () => {
    // Create a buffer larger than 16MB
    const largeBuffer = Buffer.alloc(17 * 1024 * 1024);
    const result = await transcribeAudioBuffer(largeBuffer, 'audio/m4a');

    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.code).toBe('FILE_TOO_LARGE');
    }
  });

  it('sends correct filename based on mimeType', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ task: 'transcribe', language: 'en', duration: 1.0, text: 'test', segments: [] }),
    });

    const fakeAudioBuffer = Buffer.from('audio-data');
    await transcribeAudioBuffer(fakeAudioBuffer, 'audio/m4a');

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain('v1/audio/transcriptions');
    expect(options.method).toBe('POST');
    expect(options.headers.authorization).toBe('Bearer mock-api-key');

    // Check that the FormData contains the file with correct name
    const formData = options.body as FormData;
    const file = formData.get('file') as File;
    expect(file.name).toBe('audio.m4a');
    expect(file.type).toBe('audio/m4a');
  });

  it('handles webm format correctly', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ task: 'transcribe', language: 'en', duration: 1.0, text: 'test', segments: [] }),
    });

    const fakeAudioBuffer = Buffer.from('webm-audio-data');
    await transcribeAudioBuffer(fakeAudioBuffer, 'audio/webm');

    const [, options] = mockFetch.mock.calls[0];
    const formData = options.body as FormData;
    const file = formData.get('file') as File;
    expect(file.name).toBe('audio.webm');
  });
});
