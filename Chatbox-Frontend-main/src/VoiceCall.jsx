import React, { useState, useEffect, useRef } from "react";
import {
  FaMicrophone,
  FaMicrophoneSlash,
  FaVolumeUp,
  FaVolumeMute,
  FaUserCircle,
} from "react-icons/fa";
import { MdCallEnd } from "react-icons/md";

const VoiceCall = ({ endCall, userName, socket, selectedUser, groupParticipants, isGroupCall, safeRender, users }) => {
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [isCallActive, setIsCallActive] = useState(false);
  const [callStatus, setCallStatus] = useState('connecting');
  const localAudioRef = useRef(null);
  const remoteAudioRefs = useRef({});
  const peerConnectionsRef = useRef({});
  const localStreamRef = useRef(null);
  const timerRef = useRef(null);
  const audioContext = useRef(null);
  const audioDestination = useRef(null);
  const callingToneRef = useRef(new Audio('/calling-tone.mp3'));
  const ringToneRef = useRef(new Audio('/ringtone.mp3'));

  useEffect(() => {
    audioContext.current = new (window.AudioContext || window.webkitAudioContext)();
    audioDestination.current = audioContext.current.createMediaStreamDestination();
    
    if (callingToneRef.current) {
      callingToneRef.current.loop = true;
      callingToneRef.current.volume = 0.5;
    }
    if (ringToneRef.current) {
      ringToneRef.current.loop = true;
      ringToneRef.current.volume = 0.5;
    }
    
    return () => {
      if (audioContext.current) {
        audioContext.current.close();
      }
      stopAndResetRingtones();
    };
  }, []);

  const stopAndResetRingtones = () => {
    if (callingToneRef.current) {
      callingToneRef.current.pause();
      callingToneRef.current.currentTime = 0;
    }
    if (ringToneRef.current) {
      ringToneRef.current.pause();
      ringToneRef.current.currentTime = 0;
    }
  };

  useEffect(() => {
    if (isCallActive) {
      stopAndResetRingtones();
      timerRef.current = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isCallActive]);

  useEffect(() => {
    const setupWebRTC = async () => {
      try {
        console.log("Setting up WebRTC...");
        const stream = await navigator.mediaDevices.getUserMedia({ 
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });
        localStreamRef.current = stream;
        localAudioRef.current.srcObject = stream;
        console.log("Local stream acquired");

        if (!isGroupCall || (isGroupCall && socket.current.userId === groupParticipants[0])) {
          callingToneRef.current?.play().catch(console.error);
        } else {
          ringToneRef.current?.play().catch(console.error);
        }

        if (isGroupCall) {
          console.log("Setting up group call with participants:", groupParticipants);
          groupParticipants.forEach((userId) => {
            if (userId !== socket.current.userId) {
              setupPeerConnection(userId);
            }
          });
        } else {
          console.log("Setting up private call with user:", selectedUser);
          setupPeerConnection(selectedUser);
        }
      } catch (err) {
        console.error("WebRTC setup error:", err);
        alert("Failed to access microphone. Please check your permissions.");
        handleEndCall();
      }
    };

    const setupPeerConnection = async (userId) => {
      try {
        console.log("Setting up peer connection for user:", userId);
        const pc = new RTCPeerConnection({ 
          iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            { urls: "stun:stun1.l.google.com:19302" }
          ] 
        });
        peerConnectionsRef.current[userId] = pc;

        localStreamRef.current.getTracks().forEach((track) => {
          pc.addTrack(track, localStreamRef.current);
        });

        pc.ontrack = (event) => {
          console.log("Received remote track from:", userId);
          if (!remoteAudioRefs.current[userId]) {
            remoteAudioRefs.current[userId] = new Audio();
            remoteAudioRefs.current[userId].autoplay = true;
            
            const source = audioContext.current.createMediaStreamSource(event.streams[0]);
            const gainNode = audioContext.current.createGain();
            gainNode.gain.value = isSpeakerOn ? 1.0 : 0.0;
            source.connect(gainNode);
            gainNode.connect(audioContext.current.destination);
            remoteAudioRefs.current[userId].gainNode = gainNode;
          }
          remoteAudioRefs.current[userId].srcObject = event.streams[0];
          remoteAudioRefs.current[userId].volume = isSpeakerOn ? 1.0 : 0.0;
        };

        pc.onicecandidate = (event) => {
          if (event.candidate) {
            console.log("Sending ICE candidate to:", userId);
            socket.current.emit("iceCandidate", { to: userId, candidate: event.candidate });
          }
        };

        pc.oniceconnectionstatechange = () => {
          console.log("ICE connection state:", pc.iceConnectionState);
          if (pc.iceConnectionState === 'connected') {
            setIsCallActive(true);
            setCallStatus('connected');
            stopAndResetRingtones();
            if (audioContext.current.state === 'suspended') {
              audioContext.current.resume().catch(console.error);
            }
          } else if (pc.iceConnectionState === 'disconnected') {
            handleEndCall();
          }
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.current.emit("offer", { to: userId, offer });
        console.log("Offer sent to:", userId);
      } catch (err) {
        console.error("Error in setupPeerConnection:", err);
        handleEndCall();
      }
    };

    if (!socket.current) {
      console.error("Socket not initialized");
      return;
    }

    if (socket.current) {
      setupWebRTC();

      socket.current.on("offer", async ({ from, offer }) => {
        console.log("Received offer from:", from);
        try {
          if (!peerConnectionsRef.current[from]) {
            await setupPeerConnection(from);
          }
          const pc = peerConnectionsRef.current[from];
          await pc.setRemoteDescription(new RTCSessionDescription(offer));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.current.emit("answer", { to: from, answer });
          console.log("Answer sent to:", from);
        } catch (error) {
          console.error("Error handling offer:", error);
        }
      });

      socket.current.on("answer", async ({ from, answer }) => {
        console.log("Received answer from:", from);
        const pc = peerConnectionsRef.current[from];
        if (pc) {
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(answer));
            console.log("Remote description set for:", from);
          } catch (error) {
            console.error("Error setting remote description:", error);
          }
        }
      });

      socket.current.on("iceCandidate", async ({ from, candidate }) => {
        console.log("Received ICE candidate from:", from);
        const pc = peerConnectionsRef.current[from];
        if (pc) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
            console.log("ICE candidate added for:", from);
          } catch (error) {
            console.error("Error adding ICE candidate:", error);
          }
        }
      });

      socket.current.on("callAccepted", () => {
        setCallStatus('connected');
        setIsCallActive(true);
        stopAndResetRingtones();
        if (audioContext.current.state === 'suspended') {
          audioContext.current.resume().catch(console.error);
        }
      });

      socket.current.on("callRejected", () => {
        setCallStatus('rejected');
        stopAndResetRingtones();
        handleEndCall();
      });

      socket.current.on("userBusy", () => {
        setCallStatus('busy');
        stopAndResetRingtones();
        handleEndCall();
      });

      socket.current.on("callEnded", () => {
        stopAndResetRingtones();
        handleEndCall();
      });
    }

    return () => {
      if (socket.current) {
        socket.current.off("offer");
        socket.current.off("answer");
        socket.current.off("iceCandidate");
        socket.current.off("callAccepted");
        socket.current.off("callRejected");
        socket.current.off("userBusy");
        socket.current.off("callEnded");
      }
      Object.values(peerConnectionsRef.current).forEach((pc) => pc.close());
      Object.values(remoteAudioRefs.current).forEach(audio => {
        if (audio.srcObject) {
          audio.srcObject.getTracks().forEach(track => track.stop());
        }
        if (audio.gainNode) {
          audio.gainNode.disconnect();
        }
      });
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      stopAndResetRingtones();
    };
  }, [socket, selectedUser, groupParticipants, isGroupCall]);

  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!isMuted);
      }
    }
  };

  const toggleSpeaker = async () => {
    try {
      const newIsSpeakerOn = !isSpeakerOn;
      setIsSpeakerOn(newIsSpeakerOn);

      Object.values(remoteAudioRefs.current).forEach(audio => {
        if (audio) {
          audio.volume = newIsSpeakerOn ? 1.0 : 0.0;
          if (audio.gainNode) {
            audio.gainNode.gain.value = newIsSpeakerOn ? 1.0 : 0.0;
          }
        }
      });

      if (audioContext.current.state === 'suspended') {
        await audioContext.current.resume();
      }
    } catch (error) {
      console.error('Error in toggleSpeaker:', error);
    }
  };

  const formatTime = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs < 10 ? "0" : ""}${secs}`;
  };

  const handleEndCall = () => {
    setIsCallActive(false);
    setCallDuration(0);
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    stopAndResetRingtones();
    if (socket.current) {
      socket.current.emit('endCall', { 
        to: isGroupCall ? groupParticipants : selectedUser 
      });
    }
    endCall();
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-between min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-black text-white p-4 sm:p-6 md:p-8">
      <div className="flex flex-col items-center text-center mt-6 sm:mt-10 w-full">
        <FaUserCircle className="text-gray-400 w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 animate-pulse mb-3" />
        <p className="text-lg sm:text-xl md:text-2xl font-semibold px-2 break-words">
          {userName || "Unknown"}
        </p>
        <p className={`text-xs sm:text-sm md:text-base font-semibold mt-1 ${
          callStatus === 'connected' ? "text-green-400" : 
          callStatus === 'rejected' ? "text-red-400" :
          callStatus === 'busy' ? "text-yellow-400" : "text-blue-400"
        }`}>
          {callStatus === 'connected' ? (isGroupCall ? "Group Call Ongoing" : "Call Connected") :
           callStatus === 'rejected' ? "Call Rejected" :
           callStatus === 'busy' ? "User Busy" : "Connecting..."}
        </p>
        {callStatus === 'connected' && (
          <p className="text-2xl sm:text-3xl md:text-4xl font-bold animate-pulse mt-2 sm:mt-3">
            {formatTime(callDuration)}
          </p>
        )}
        {isGroupCall && callStatus === 'connected' && (
          <div className="mt-4 text-sm">
            <p>Participants: {groupParticipants.length}</p>
            <ul className="max-h-20 overflow-y-auto">
              {groupParticipants.map((userId) => (
                <li key={userId}>
                  {safeRender(users && users.find((u) => u._id === userId)?.name || "Unknown User")}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <audio ref={localAudioRef} autoPlay muted className="hidden" />

      <div className="flex-grow"></div>

      <div className="w-full max-w-xs sm:max-w-sm md:max-w-md flex justify-between gap-4 sm:gap-6 p-4 bg-gray-800 rounded-full shadow-lg mb-4 sm:mb-6">
        {/* Mute Button */}
        <button
          className={`w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 rounded-full flex items-center justify-center transition-all duration-300 ${
            callStatus === 'connected'
              ? isMuted
                ? "bg-red-500 hover:bg-red-600"
                : "bg-gray-700 hover:bg-gray-600"
              : "bg-gray-500 cursor-not-allowed"
          }`}
          onClick={toggleMute}
          disabled={callStatus !== 'connected'}
        >
          {isMuted ? (
            <FaMicrophoneSlash className="text-white text-xl sm:text-2xl md:text-3xl" />
          ) : (
            <FaMicrophone className="text-white text-xl sm:text-2xl md:text-3xl" />
          )}
        </button>

        {/* End Call Button */}
        <button
          className="w-14 h-14 sm:w-16 sm:h-16 md:w-20 md:h-20 rounded-full flex items-center justify-center bg-red-600 hover:bg-red-700 transition-all duration-300"
          onClick={handleEndCall}
        >
          <MdCallEnd className="text-white text-2xl sm:text-3xl md:text-4xl" />
        </button>

        {/* Speaker Button */}
        <button
          className={`w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 rounded-full flex items-center justify-center transition-all duration-300 ${
            callStatus === 'connected'
              ? isSpeakerOn
                ? "bg-green-500 hover:bg-green-600 animate-pulse"
                : "bg-gray-700 hover:bg-gray-600"
              : "bg-gray-500 cursor-not-allowed"
          }`}
          onClick={async () => {
            await toggleSpeaker();
            if (audioContext.current.state === 'suspended') {
              await audioContext.current.resume();
            }
          }}
          disabled={callStatus !== 'connected'}
          title={isSpeakerOn ? "Speaker On" : "Speaker Off"}
        >
          {isSpeakerOn ? (
            <FaVolumeUp className="text-white text-xl sm:text-2xl md:text-3xl" />
          ) : (
            <FaVolumeMute className="text-white text-xl sm:text-2xl md:text-3xl" />
          )}
        </button>
      </div>
    </div>
  );
};

export default VoiceCall;