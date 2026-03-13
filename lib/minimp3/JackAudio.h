/*
 * JackAudio.h — Self-contained MP3 playback for CrowPanel Advance 5"
 *
 * Uses:
 *   - minimp3 (lieff) for MP3 decoding — single header, no network deps
 *   - ESP-IDF I2S std driver (driver/i2s_std.h) — available in Jason2866/IDF53
 *   - SD_MMC for file access (1-bit SDIO, no CS pin required)
 *
 * I2S pins (CrowPanel Advance 5", confirmed from Elecrow official source):
 *   BCLK = GPIO 5
 *   LRC  = GPIO 6
 *   DOUT = GPIO 4
 *
 * Usage:
 *   JackAudio audio;
 *   audio.begin(5, 6, 4);        // bclk, lrc, dout
 *   audio.play("/habits/run.mp3");
 *   // in loop():
 *   audio.loop();
 *   // to stop:
 *   audio.stop();
 *   // to check if playing:
 *   if (audio.isPlaying()) { ... }
 */

#pragma once

#define MINIMP3_IMPLEMENTATION
#define MINIMP3_ONLY_MP3
#define MINIMP3_NO_SIMD
#include "minimp3.h"

// minimp3_ex.h defines MINIMP3_MIN_DATA_SIZE but we don't need the extended API.
// Define it ourselves: minimum bytes needed before attempting to decode a frame.
#ifndef MINIMP3_MIN_DATA_SIZE
#define MINIMP3_MIN_DATA_SIZE 4
#endif

#include <SD_MMC.h>
#include <driver/i2s_std.h>
#include <driver/i2s_pdm.h>
#include <driver/i2s_common.h>

class JackAudio {
public:
    JackAudio() : _handle(nullptr), _playing(false), _volume(18) {}

    // Call once in setup(). bclk/lrc/dout are the I2S GPIO pins.
    bool begin(int bclk, int lrc, int dout) {
        _bclk = bclk; _lrc = lrc; _dout = dout;
        mp3dec_init(&_mp3d);
        return true;
    }

    // Set volume 0..21 (maps to I2S gain scaling)
    void setVolume(int v) { _volume = constrain(v, 0, 21); }

    // Start playing an MP3 file from SD_MMC.
    // Returns true if file opened successfully.
    bool play(const char *path) {
        stop();
        _file = SD_MMC.open(path, FILE_READ);
        if (!_file) {
            Serial.printf("[audio] cannot open: %s\n", path);
            return false;
        }
        _fileSize = _file.size();
        _bytesRead = 0;
        _bufFill = 0;

        // Install I2S driver at the sample rate of the first decoded frame.
        // We'll install it after decoding the first frame (we don't know rate yet).
        _driverInstalled = false;
        _playing = true;
        Serial.printf("[audio] playing: %s (%u bytes)\n", path, _fileSize);
        return true;
    }

    // Call every loop() iteration.
    void loop() {
        if (!_playing) return;

        // Refill read buffer
        _refillBuffer();
        if (_bufFill < MINIMP3_MIN_DATA_SIZE) {
            // End of file
            _finishPlayback();
            return;
        }

        // Decode one MP3 frame
        mp3dec_frame_info_t info;
        mp3d_sample_t pcm[MINIMP3_MAX_SAMPLES_PER_FRAME];
        int samples = mp3dec_decode_frame(&_mp3d, _buf, _bufFill, pcm, &info);

        if (info.frame_bytes == 0) {
            // No sync found — skip a byte and try again
            if (_bufFill > 0) {
                memmove(_buf, _buf + 1, _bufFill - 1);
                _bufFill--;
            }
            return;
        }

        // Consume the frame bytes from the buffer
        _bufFill -= info.frame_bytes;
        if (_bufFill > 0) memmove(_buf, _buf + info.frame_bytes, _bufFill);

        if (samples <= 0) return;

        // Install I2S driver on first frame (now we know sample rate and channels)
        if (!_driverInstalled) {
            _installDriver(info.hz, info.channels);
        }

        // Scale volume
        if (_volume < 21) {
            float gain = _volume / 21.0f;
            for (int i = 0; i < samples * info.channels; i++) {
                pcm[i] = (mp3d_sample_t)(pcm[i] * gain);
            }
        }

        // Write PCM to I2S (blocking with short timeout)
        size_t written = 0;
        i2s_channel_write(_handle, pcm, samples * info.channels * sizeof(int16_t),
                          &written, pdMS_TO_TICKS(100));
    }

    void stop() {
        _playing = false;
        if (_file) { _file.close(); }
        _uninstallDriver();
        _bufFill = 0;
        _bytesRead = 0;
    }

    bool isPlaying() const { return _playing; }

private:
    static constexpr size_t READ_BUF_SIZE = 4096;

    i2s_chan_handle_t _handle;
    bool _driverInstalled;
    bool _playing;
    int  _volume;
    int  _bclk, _lrc, _dout;

    File   _file;
    size_t _fileSize;
    size_t _bytesRead;

    mp3dec_t _mp3d;
    uint8_t  _buf[READ_BUF_SIZE + MINIMP3_MAX_SAMPLES_PER_FRAME * 4];
    int      _bufFill;

    void _refillBuffer() {
        int space = (int)sizeof(_buf) - _bufFill;
        if (space <= 0 || !_file || !_file.available()) return;
        int toRead = min(space, (int)READ_BUF_SIZE);
        int got = _file.read(_buf + _bufFill, toRead);
        if (got > 0) {
            _bufFill += got;
            _bytesRead += got;
        }
        if (!_file.available() && _bytesRead >= _fileSize) {
            // File fully read; let loop() drain remaining buffer
        }
    }

    void _installDriver(int sampleRate, int channels) {
        if (_driverInstalled) return;

        i2s_chan_config_t chan_cfg = I2S_CHANNEL_DEFAULT_CONFIG(I2S_NUM_0, I2S_ROLE_MASTER);
        chan_cfg.auto_clear = true;
        i2s_new_channel(&chan_cfg, &_handle, nullptr);

        i2s_std_config_t std_cfg = {
            .clk_cfg  = I2S_STD_CLK_DEFAULT_CONFIG((uint32_t)sampleRate),
            .slot_cfg = I2S_STD_MSB_SLOT_DEFAULT_CONFIG(I2S_DATA_BIT_WIDTH_16BIT,
                            channels == 2 ? I2S_SLOT_MODE_STEREO : I2S_SLOT_MODE_MONO),
            .gpio_cfg = {
                .mclk = I2S_GPIO_UNUSED,
                .bclk = (gpio_num_t)_bclk,
                .ws   = (gpio_num_t)_lrc,
                .dout = (gpio_num_t)_dout,
                .din  = I2S_GPIO_UNUSED,
                .invert_flags = { .mclk_inv = false, .bclk_inv = false, .ws_inv = false }
            }
        };

        i2s_channel_init_std_mode(_handle, &std_cfg);
        i2s_channel_enable(_handle);
        _driverInstalled = true;
        Serial.printf("[audio] I2S driver installed: %dHz %dch\n", sampleRate, channels);
    }

    void _uninstallDriver() {
        if (!_driverInstalled) return;
        i2s_channel_disable(_handle);
        i2s_del_channel(_handle);
        _handle = nullptr;
        _driverInstalled = false;
    }

    void _finishPlayback() {
        Serial.println("[audio] playback complete");
        stop();
    }
};
