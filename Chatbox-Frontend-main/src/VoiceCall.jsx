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
  const [isCallActive, setIsCallActive] = useState(true);
  const localAudioRef = useRef(null);
  const remoteAudioRefs = useRef({});
  const peerConnectionsRef = useRef({});
  const localStreamRef = useRef(null);
  const [isCallAnswered, setIsCallAnswered] = useState(false);
  const [isRinging, setIsRinging] = useState(true);
  const [isCaller, setIsCaller] = useState(false);
  const ringToneRef = useRef(new Audio('/ringtone.mp3'));

  useEffect(() => {
    let timer;
    if (isCallActive && isCallAnswered) {
      timer = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [isCallActive, isCallAnswered]);


  useEffect(() => {
    // Handle ringtone
    if (isRinging && !isCallAnswered) {
      ringToneRef.current.loop = true;
      if (isCaller) {
        ringToneRef.current.src = '/calling-tone.mp3';
      } else {
        ringToneRef.current.src = '/ringtone.mp3';
      }
      ringToneRef.current.play().catch(err => console.error('Ringtone error:', err));
    } else {
      ringToneRef.current.pause();
      ringToneRef.current.currentTime = 0;
    }

    return () => {
      ringToneRef.current.pause();
      ringToneRef.current.currentTime = 0;
    };
  }, [isRinging, isCallAnswered, isCaller]);

  useEffect(() => {
    if (socket.current) {
      // Handle call initiation
      socket.current.on("initiateCall", () => {
        setIsCaller(true);
        setIsRinging(true);
      });

      // Handle call answer
      socket.current.on('callAnswered', () => {
        setIsCallAnswered(true);
        setIsRinging(false);
      });

      // Handle call rejection
      socket.current.on('callRejected', () => {
        setIsRinging(false);
        handleEndCall();
      });

      return () => {
        socket.current.off("initiateCall");
        socket.current.off('callAnswered');
        socket.current.off('callRejected');
      };
    }
  }, [socket]);


  useEffect(() => {
    
    const setupWebRTC = async () => {
      try {
        console.log("Setting up WebRTC...");
        localStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
        localAudioRef.current.srcObject = localStreamRef.current;
        console.log("Local stream acquired");

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
          }
          remoteAudioRefs.current[userId].srcObject = event.streams[0];
        };

        pc.onicecandidate = (event) => {
          if (event.candidate) {
            console.log("Sending ICE candidate to:", userId);
            socket.current.emit("iceCandidate", { to: userId, candidate: event.candidate });
          }
        };

        pc.oniceconnectionstatechange = () => {
          console.log("ICE connection state:", pc.iceConnectionState);
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.current.emit("offer", { to: userId, offer });
        console.log("Offer sent to:", userId);
      } catch (err) {
        console.error("Error in setupPeerConnection:", err);
      }
    };

    if (!socket.current) {
      console.error("Socket not initialized");
      return;
    }

    if (socket.current && isCallActive) {
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
    }

    return () => {
      if (socket.current) {
        socket.current.off("offer");
        socket.current.off("answer");
        socket.current.off("iceCandidate");
      }
      Object.values(peerConnectionsRef.current).forEach((pc) => pc.close());
      Object.values(remoteAudioRefs.current).forEach(audio => {
        if (audio.srcObject) {
          audio.srcObject.getTracks().forEach(track => track.stop());
        }
      });
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, [socket, isCallActive, selectedUser, groupParticipants, isGroupCall]);

  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!isMuted);
      }
    }
  };

  const toggleSpeaker = () => {
    setIsSpeakerOn(!isSpeakerOn);
    Object.values(remoteAudioRefs.current).forEach(audio => {
      if (audio) {
        audio.volume = isSpeakerOn ? 0.5 : 1;
      }
    });
  };

  const formatTime = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs < 10 ? "0" : ""}${secs}`;
  };

  const handleEndCall = () => {
    setIsCallActive(false);
    setCallDuration(0);
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
          isCallActive ? "text-green-400" : "text-red-400"
        }`}>
          {isCallActive ? 
            (isCallAnswered ? 
              (isGroupCall ? "Group Call Ongoing" : "Call Connected") 
              : "Calling...") 
            : "Call Ended"}
        </p>
        {isCallActive && isCallAnswered && (
          <p className="text-2xl sm:text-3xl md:text-4xl font-bold animate-pulse mt-2 sm:mt-3">
            {formatTime(callDuration)}
          </p>
        )}
        {isGroupCall && isCallActive && (
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
        <button
          className={`w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 rounded-full flex items-center justify-center transition-all duration-300 ${
            isCallActive
              ? isMuted
                ? "bg-red-500 hover:bg-red-600"
                : "bg-gray-700 hover:bg-gray-600"
              : "bg-gray-500 cursor-not-allowed"
          }`}
          onClick={toggleMute}
          disabled={!isCallActive}
        >
          {isMuted ? (
            <FaMicrophoneSlash className="text-white text-xl sm:text-2xl md:text-3xl" />
          ) : (
            <FaMicrophone className="text-white text-xl sm:text-2xl md:text-3xl" />
          )}
        </button>

        <button
          className={`w-14 h-14 sm:w-16 sm:h-16 md:w-20 md:h-20 rounded-full flex items-center justify-center transition-all duration-300 ${
            isCallActive ? "bg-red-600 hover:bg-red-700" : "bg-gray-500 cursor-not-allowed"
          }`}
          onClick={handleEndCall}
          disabled={!isCallActive}
        >
          <MdCallEnd className="text-white text-2xl sm:text-3xl md:text-4xl" />
        </button>

        <button
          className={`w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 rounded-full flex items-center justify-center transition-all duration-300 ${
            isCallActive
              ? isSpeakerOn
                ? "bg-green-500 hover:bg-green-600"
                : "bg-gray-700 hover:bg-gray-600"
              : "bg-gray-500 cursor-not-allowed"
          }`}
          onClick={toggleSpeaker}
          disabled={!isCallActive}
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