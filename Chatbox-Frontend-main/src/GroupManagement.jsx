import React, { useState } from "react";
import axios from "axios";

const safeRender = (value, fallback = "Unknown") => {
  if (!value) return fallback;
  if (typeof value === "string") return value;
  if (typeof value === "object" && value?.name) return value.name;
  return JSON.stringify(value);
};

const Loader = () => (
  <div className="flex justify-center items-center h-full">
    <div className="loader"></div>
    <style jsx>{`
      .loader {
        border: 8px solid #f3f3f3;
        border-top: 8px solid #3498db;
        border-radius: 50%;
        width: 40px;
        height: 40px;
        animation: spin 1s linear infinite;
      }

      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    `}</style>
  </div>
);

const GroupManagement = ({
  token,
  users,
  groups,
  setGroups,
  setSelectedChat,
  setChatType,
  currentUserId,
  showUserProfile,
  showOnlyGroups,
  setShowOnlyGroups,
  showOnlyContacts,
  setShowOnlyContacts,
  lastMessageTimes,
  socket,
}) => {
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [selectedMembers, setSelectedMembers] = useState([]);
  const [editingGroupId, setEditingGroupId] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);

  const isGroupAdmin = (groupId) => {
    const group = groups.find((g) => g._id === groupId);
    return group && safeRender(group.creator?._id || group.creator) === currentUserId;
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim()) {
      alert("Please enter a group name.");
      return;
    }
    if (selectedMembers.length === 0) {
      alert("Please select at least one member.");
      return;
    }
    setLoading(true);
    try {
      const createResponse = await axios.post(
        "https://chatbox-einfra.onrender.com/api/groups",
        { name: groupName },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const groupId = createResponse.data._id;

      await Promise.all(
        selectedMembers
          .filter(userId => userId !== currentUserId)
          .map((userId) =>
            axios.put(
              `https://chatbox-einfra.onrender.com/api/groups/${groupId}/members`,
              { userId, canSendMessages: true, canCall: true },
              { headers: { Authorization: `Bearer ${token}` } }
            )
          )
      );

      setGroups((prev) => [...prev, createResponse.data]);
      setGroupName("");
      setSelectedMembers([]);
      setShowCreateGroup(false);
      console.log("Group created successfully:", createResponse.data);
      window.location.reload();
    } catch (err) {
      const errorMessage = err.response?.data?.error || "Failed to create group. Check console for details.";
      alert(errorMessage);
      console.error("Error creating group:", err.response?.data || err.message);
    } finally {
      setLoading(false);
    }
  };

  const addMemberToGroup = async (groupId, userId) => {
    if (!userId || !groupId) return;
    if (!isGroupAdmin(groupId)) {
      alert("You are not an admin, so you can't add members to this group.");
      return;
    }
    const canSendMessages = window.confirm(
      `Allow ${safeRender(users.find((u) => u._id === userId)?.name, userId)} to send messages?`
    );
    const canCall = window.confirm(
      `Allow ${safeRender(users.find((u) => u._id === userId)?.name, userId)} to make calls?`
    );
    try {
      const response = await axios.put(
        `https://chatbox-einfra.onrender.com/api/groups/${groupId}/members`,
        { userId, canSendMessages, canCall },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setGroups((prev) => prev.map((g) => (g._id === groupId ? response.data : g)));
    } catch (error) {
      console.error("Error adding member to group:", error);
      alert("Failed to add member to group.");
    }
};

const updateGroupPermissions = async (groupId, userId, canSendMessages, canCall) => {
  if (!groupId || !userId) return;
  if (!isGroupAdmin(groupId)) {
    alert("You are not an admin, so you can't modify group permissions.");
    return;
  }

  // Optimistic update
  setGroups((prev) =>
    prev.map((g) => {
      if (g._id === groupId) {
        return {
          ...g,
          members: g.members.map((m) => {
            if (safeRender(m.userId?._id || m.userId) === userId) {
              return { ...m, canSendMessages, canCall };
            }
            return m;
          }),
        };
      }
      return g;
    })
  );

  try {
    const response = await axios.put(
      `https://chatbox-einfra.onrender.com/api/groups/${groupId}/permissions`,
      { userId, canSendMessages, canCall },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    // Update with server response in case there were any differences
    setGroups((prev) => prev.map((g) => (g._id === groupId ? response.data : g)));
  } catch (error) {
    // Revert the optimistic update on error
    console.error("Error updating permissions:", error);
    alert("Failed to update permissions.");
    const response = await axios.get(
      `https://chatbox-einfra.onrender.com/api/groups/${groupId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    setGroups((prev) => prev.map((g) => (g._id === groupId ? response.data : g)));
  }
};

const removeMemberFromGroup = async (groupId, userId) => {
    if (!isGroupAdmin(groupId)) {
      alert("You are not an admin, so you can't remove members from this group.");
      return;
    }
    if (
      !window.confirm(
        `Are you sure you want to remove ${safeRender(
          users.find((u) => u._id === userId)?.name,
          userId
        )} from the group?`
      )
    ) {
      return;
    }

    try {
      const response = await axios.delete(
        `https://chatbox-einfra.onrender.com/api/groups/${groupId}/members/${userId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setGroups((prev) => prev.map((g) => (g._id === groupId ? response.data : g)));
    } catch (error) {
      console.error("Error removing member from group:", error);
      alert("Failed to remove member from group.");
    }
  };

  const deleteGroup = async (groupId) => {
    if (!isGroupAdmin(groupId)) {
      alert("You are not an admin, so you can't delete this group.");
      return;
    }
    if (!window.confirm("Are you sure you want to delete this group? This action cannot be undone.")) {
      return;
    }

    try {
      await axios.delete(`https://chatbox-einfra.onrender.com/api/groups/${groupId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setGroups((prev) => prev.filter((g) => g._id !== groupId));
      setEditingGroupId(null);
      setSelectedChat(null);
      setChatType(null);
    } catch (error) {
      console.error("Error deleting group:", error);
      alert("Failed to delete group.");
    }
  };

  const toggleEditGroup = (groupId) => {
    setEditingGroupId((prev) => (prev === groupId ? null : groupId));
  };

  const getLastMessageTime = (userId) => {
    const lastMessage = lastMessageTimes.find((lm) => lm.userId === userId);
    return lastMessage
      ? new Date(lastMessage.lastMessageTime).toLocaleString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        })
      : "No messages yet";
  };

  const filteredGroups = groups.filter((group) =>
    safeRender(group.name).toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredUsers = users.filter((user) =>
    safeRender(user.name).toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <>
      <div className="p-2 sm:p-4 border-b border-gray-200 space-y-3">
        <input
          type="text"
          placeholder={
            showOnlyGroups
              ? "Search groups..."
              : showOnlyContacts
              ? "Search contacts..."
              : "Search..."
          }
          className="w-full p-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 text-sm sm:text-base"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {!showOnlyGroups && !showOnlyContacts && (
          <button
            onClick={() => setShowCreateGroup(true)}
            className="w-full p-2 bg-gradient-to-r from-blue-400 to-blue-600 text-white rounded-lg hover:from-blue-500 hover:to-blue-600 text-sm sm:text-base"
          >
            Create New Group
          </button>
        )}
      </div>
      <div className="h-[calc(100vh-220px)] sm:h-[calc(100vh-240px)] overflow-y-auto">
        {(showOnlyGroups || (!showOnlyGroups && !showOnlyContacts)) && filteredGroups.length > 0 && (
          <div className="p-2">
            <h2 className="text-xs sm:text-sm font-semibold text-gray-500 px-2 sm:px-4 mb-2 sticky top-0 bg-white z-10">Groups</h2>
            {filteredGroups.map((group) => (
              <div key={group._id} className="p-2 sm:p-4 relative">
                <div className="flex items-center hover:bg-gray-50 cursor-pointer">
                  <div
                    className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-r from-blue-400 to-blue-500 rounded-full flex items-center justify-center cursor-pointer hover:opacity-90 transition-opacity"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!showOnlyGroups) {
                        toggleEditGroup(group._id);
                      }
                    }}
                  >
                    <span className="text-white font-bold text-sm sm:text-base">
                      {safeRender(group.name[0])}
                    </span>
                  </div>
                  <div
                    className="ml-2 sm:ml-4 flex-1"
                    onClick={() => {
                      setSelectedChat(group._id);
                      setChatType("group");
                      setShowOnlyGroups(false);
                      setShowOnlyContacts(false);
                    }}
                  >
                    <p className="text-gray-800 font-medium text-sm sm:text-base">{safeRender(group.name)}</p>
                    <p className="text-xs sm:text-sm text-gray-500">{group.members.length} members</p>
                  </div>
                </div>
                {editingGroupId === group._id && !showOnlyGroups && (
                  <div className="fixed inset-0 bg-white-500 bg-opacity-30 backdrop-blur-sm flex justify-center items-center z-[100] p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg transform transition-all animate-in zoom-in-95 duration-300">
                      <div className="p-6 border-b border-gray-100">
                      <div className="flex items-start justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 bg-gradient-to-r from-blue-400 to-blue-500 rounded-full flex items-center justify-center overflow-hidden shrink-0 -mt-5">
                              <span className="text-white font-bold text-xl">{safeRender(group.name[0])}</span>
                            </div>
                            <div>
                              <h3 className="text-xl font-bold text-gray-800">
                                {isGroupAdmin(group._id) ? "Edit Group" : "Group Info"}
                              </h3>
                              <p className="text-sm text-gray-500">{safeRender(group.name)}</p>
                              {!isGroupAdmin(group._id) && (
                                <p className="text-xs text-red-500 mt-1">
                                  You are not an admin. You can view but cannot modify group settings.
                                </p>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={() => setEditingGroupId(null)}
                            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                          >
                            <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      </div>

                      <div className="p-6 max-h-[60vh] overflow-y-auto">
                        <div className="space-y-3 mb-6">
                          <h4 className="text-sm font-semibold text-gray-700 mb-2">Group Members</h4>
                          {group.members.map((member, index) => (
                            <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 bg-gradient-to-r from-blue-400 to-blue-500 rounded-full flex items-center justify-center">
                                  <span className="text-white font-medium">
                                    {safeRender(
                                      users.find((u) => u._id === safeRender(member.userId?._id || member.userId))?.name[0]
                                    )}
                                  </span>
                                </div>
                                <span className="text-sm font-medium text-gray-700">
                                  {safeRender(
                                    users.find((u) => u._id === safeRender(member.userId?._id || member.userId))?.name,
                                    member.userId
                                  )}
                                </span>
                              </div>
                              <div className="flex items-center gap-4">
                                <div className="flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    checked={member.canSendMessages || false}
                                    onChange={(e) =>
                                      updateGroupPermissions(
                                        group._id,
                                        safeRender(member.userId?._id || member.userId),
                                        e.target.checked,
                                        member.canCall || false
                                      )
                                    }
                                    disabled={!isGroupAdmin(group._id) || safeRender(member.userId?._id || member.userId) === currentUserId}
                                    className="rounded text-blue-500 focus:ring-blue-500 h-4 w-4"
                                  />
                                  <span className="text-xs text-gray-600">Chat</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    checked={member.canCall || false}
                                    onChange={(e) =>
                                      updateGroupPermissions(
                                        group._id,
                                        safeRender(member.userId?._id || member.userId),
                                        member.canSendMessages || false,
                                        e.target.checked
                                      )
                                    }
                                    disabled={!isGroupAdmin(group._id) || safeRender(member.userId?._id || member.userId) === currentUserId}
                                    className="rounded text-blue-500 focus:ring-blue-500 h-4 w-4"
                                  />
                                  <span className="text-xs text-gray-600">Call</span>
                                </div>
                                {safeRender(member.userId?._id || member.userId) !== currentUserId && isGroupAdmin(group._id) && (
                                  <button
                                    onClick={() =>
                                      removeMemberFromGroup(group._id, safeRender(member.userId?._id || member.userId))
                                    }
                                    className="p-1 hover:bg-red-100 rounded-full transition-colors"
                                  >
                                    <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>

                        {isGroupAdmin(group._id) && (
                          <div className="mb-6">
                            <h4 className="text-sm font-semibold text-gray-700 mb-2">Add Member</h4>
                            <select
                              onChange={(e) => {
                                if (e.target.value) {
                                  addMemberToGroup(group._id, e.target.value);
                                  e.target.value = "";
                                }
                              }}
                              className="w-full p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm bg-gray-50"
                              defaultValue=""
                            >
                              <option value="">Select a user to add</option>
                              {users
                                .filter((u) => !group.members.some((m) => safeRender(m.userId?._id || m.userId) === u._id))
                                .map((user) => (
                                  <option key={user._id} value={user._id}>
                                    {safeRender(user.name)}
                                  </option>
                                ))}
                            </select>
                          </div>
                        )}
                      </div>

                      <div className="p-6 border-t border-gray-100 flex justify-between">
                        {isGroupAdmin(group._id) && (
                          <button
                            onClick={() => deleteGroup(group._id)}
                            className="px-4 py-2 bg-red-500 text-white rounded-xl hover:bg-red-600 transition-colors text-sm font-medium flex items-center gap-2"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth="2"
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5-4h4M9 7v12m6-12v12"
                              />
                            </svg>
                            Delete Group
                          </button>
                        )}
                        <button
                          onClick={() => setEditingGroupId(null)}
                          className="px-4 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl hover:from-blue-600 hover:to-blue-700 transition-all text-sm font-medium"
                        >
                          Done
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {(showOnlyContacts || (!showOnlyGroups && !showOnlyContacts)) && (
          <div className="p-2 pb-20">
            <h2 className="text-xs sm:text-sm font-semibold text-gray-500 px-2 sm:px-4 mb-2 sticky top-0 bg-white z-10">
              Direct Messages
            </h2>
            {filteredUsers.map((user) => (
              <div
                key={user._id}
                className="flex items-center p-2 sm:p-4 hover:bg-gray-50 cursor-pointer"
                onClick={() => {
                  setSelectedChat(user._id);
                  setChatType("user");
                  setShowOnlyContacts(false);
                  setShowOnlyGroups(false);
                }}
              >
                <div
                  className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-r from-blue-500 to-blue-400 rounded-full flex items-center justify-center hover:opacity-80"
                  onClick={(e) => {
                    e.stopPropagation();
                    showUserProfile(user._id);
                  }}
                >
                  <span className="text-white font-bold text-sm sm:text-base">{safeRender(user.name?.[0])}</span>
                </div>
                <div className="ml-2 sm:ml-4">
                  <p className="text-gray-800 font-medium text-sm sm:text-base">{safeRender(user.name)}</p>
                  <p className="text-xs sm:text-sm text-gray-500">{getLastMessageTime(user._id)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showCreateGroup && !showOnlyGroups && !showOnlyContacts && (
        <div
          className="fixed inset-0 bg-white-500 bg-opacity-30 backdrop-blur-sm flex justify-center items-center z-[100] p-4"
          onClick={() => setShowCreateGroup(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-lg transform transition-all animate-in zoom-in-95 duration-300 p-4 sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg sm:text-xl font-bold mb-4">Create New Group</h2>
            <input
              type="text"
              placeholder="Group Name"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-lg mb-4 focus:outline-none focus:border-blue-500 text-sm sm:text-base"
            />
            <div className="mb-4">
              <h3 className="text-xs sm:text-sm font-semibold mb-2">Select Members</h3>
              <div className="max-h-40 sm:max-h-48 overflow-y-auto">
                {users.map((user) => (
                  <div key={user._id} className="flex items-center p-2 text-sm">
                    <input
                      type="checkbox"
                      id={`user-${user._id}`}
                      checked={selectedMembers.includes(user._id)}
                      onChange={() =>
                        setSelectedMembers((prev) =>
                          prev.includes(user._id) ? prev.filter((id) => id !== user._id) : [...prev, user._id]
                        )
                      }
                      className="mr-2"
                    />
                    <label htmlFor={`user-${user._id}`}>{safeRender(user.name)}</label>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex justify-end space-x-2">
              <button
                onClick={() => setShowCreateGroup(false)}
                className="px-3 sm:px-4 py-2 text-gray-600 hover:text-gray-800 text-sm sm:text-base"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateGroup}
                disabled={!groupName.trim() || selectedMembers.length === 0 || loading}
                className={`px-3 sm:px-4 py-2 text-white rounded-lg text-sm sm:text-base ${
                  !groupName.trim() || selectedMembers.length === 0 || loading
                    ? "bg-gray-400 cursor-not-allowed"
                    : "bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700"
                }`}
              >
                {loading ? <Loader /> : "Create Group"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default GroupManagement;