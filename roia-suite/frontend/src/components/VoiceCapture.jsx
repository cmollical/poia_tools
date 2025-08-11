import React, { useState, useRef, useEffect } from 'react';

const VoiceCapture = ({ onTranscriptUpdate, onError }) => {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [manualInput, setManualInput] = useState(false);
  const [error, setError] = useState('');
  const [isSupported, setIsSupported] = useState(true);
  const [manualStop, setManualStop] = useState(false);
  const recognitionRef = useRef(null);

  useEffect(() => {
    // Check if Web Speech API is supported
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      setIsSupported(false);
      setError('Speech recognition is not supported in this browser. Please use Chrome, Edge, or Safari.');
      return;
    }

    // Initialize speech recognition
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
      setError('');
    };

    recognition.onresult = (event) => {
      let finalTranscript = '';
      let interimText = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcriptPart = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcriptPart;
        } else {
          interimText += transcriptPart;
        }
      }

      if (finalTranscript) {
        const newTranscript = transcript + finalTranscript;
        setTranscript(newTranscript);
        onTranscriptUpdate?.(newTranscript);
      }
      
      setInterimTranscript(interimText);
    };

    recognition.onerror = (event) => {
      setIsListening(false);
      let errorMessage = 'Speech recognition error occurred.';
      
      switch (event.error) {
        case 'not-allowed':
          errorMessage = 'Microphone access denied. Please allow microphone permissions and try again.';
          break;
        case 'no-speech':
          errorMessage = 'No speech detected. Please try speaking again.';
          break;
        case 'audio-capture':
          errorMessage = 'No microphone found. Please check your microphone connection.';
          break;
        case 'network':
          errorMessage = 'Network error occurred. Please check your internet connection.';
          break;
        case 'aborted':
          errorMessage = 'Speech recognition was aborted.';
          break;
        default:
          errorMessage = `Speech recognition error: ${event.error}`;
      }
      
      setError(errorMessage);
      onError?.(errorMessage);
    };

    recognition.onend = () => {
      setIsListening(false);
      setInterimTranscript('');
      
      // Auto-restart recognition if it wasn't manually stopped
      if (!manualStop && isListening) {
        setTimeout(() => {
          try {
            recognitionRef.current?.start();
          } catch (error) {
            console.warn('Could not restart speech recognition:', error);
          }
        }, 100);
      }
    };

    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, [transcript, onTranscriptUpdate, onError]);

  const startListening = () => {
    if (!isSupported) return;
    
    setManualStop(false); // Reset manual stop flag
    setError(''); // Clear any previous errors
    
    try {
      recognitionRef.current?.start();
    } catch (error) {
      if (error.name === 'InvalidStateError') {
        // Recognition is already running, stop and restart
        recognitionRef.current?.stop();
        setTimeout(() => {
          recognitionRef.current?.start();
        }, 100);
      }
    }
  };

  const stopListening = () => {
    setManualStop(true); // Mark as manually stopped
    recognitionRef.current?.stop();
  };

  const clearTranscript = () => {
    setTranscript('');
    setInterimTranscript('');
    onTranscriptUpdate?.('');
  };

  if (!isSupported) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-red-800">Browser Not Supported</h3>
            <p className="mt-1 text-sm text-red-700">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <div className="mb-4">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Voice Input</h2>
        <p className="text-sm text-gray-600">Click the microphone to start recording your project update</p>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <div className="flex items-center justify-center mb-6">
        <button
          onClick={isListening ? stopListening : startListening}
          className={`relative p-4 rounded-full text-white transition-all duration-200 ${
            isListening 
              ? 'bg-red-500 hover:bg-red-600 animate-pulse' 
              : 'bg-blue-500 hover:bg-blue-600'
          }`}
          disabled={!isSupported}
        >
          {isListening ? (
            <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
            </svg>
          ) : (
            <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          )}
          {isListening && (
            <span className="absolute -top-1 -right-1 h-3 w-3 bg-red-400 rounded-full animate-ping"></span>
          )}
        </button>
      </div>

      <div className="flex gap-2 mb-4">
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
          isListening ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'
        }`}>
          {isListening ? 'Listening...' : 'Ready'}
        </span>
        {transcript && (
          <button
            onClick={clearTranscript}
            className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 hover:bg-gray-200"
          >
            Clear
          </button>
        )}
      </div>

      <div className="min-h-[120px] border-2 border-dashed border-gray-300 rounded-lg bg-gray-50">
        <textarea
          className="w-full h-full min-h-[120px] p-4 bg-transparent resize-none focus:outline-none text-sm text-gray-900"
          value={transcript + (interimTranscript ? interimTranscript : '')}
          onChange={(e) => {
            setTranscript(e.target.value);
            setManualInput(true);
            onTranscriptUpdate?.(e.target.value);
          }}
          placeholder="Your spoken words will appear here, or type/paste your text..."
          onClick={() => setManualInput(true)}
        />
      </div>

      {transcript && (
        <div className="mt-4 text-xs text-gray-500">
          Word count: {transcript.trim().split(/\s+/).length}
        </div>
      )}
    </div>
  );
};

export default VoiceCapture;
