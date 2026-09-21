import SocialSheet from './SocialSheet';
import FriendsManager from './FriendsManager';
import FriendSuggestions from './FriendSuggestions';

// Adding people, behind the 👤+ icon.
//
// The accordion this replaces sat between the leaderboard and the feed,
// permanently, for a thing you do a handful of times ever. Suggestions
// come along with it rather than staying on the page: "people you might
// know" is the same job as the code box and the search field, and three
// of them took a screen and a half.
//
// FriendsManager renders open here — its own show/hide toggle would be a
// second disclosure inside a sheet you already chose to open.
export default function FriendManagementModal({
  myFriendCode,
  myUid,
  friends,
  incomingRequests,
  onSendRequest,
  onSendRequestByUid,
  onRespond,
  suggestions,
  suggestionsLoading,
  onClose,
}) {
  return (
    <SocialSheet
      title="Friends"
      subtitle={
        incomingRequests.length > 0
          ? `${incomingRequests.length} request${incomingRequests.length === 1 ? '' : 's'} waiting`
          : `${friends.length} friend${friends.length === 1 ? '' : 's'}`
      }
      onClose={onClose}
    >
      <FriendsManager
        embedded
        myFriendCode={myFriendCode}
        myUid={myUid}
        friends={friends}
        incomingRequests={incomingRequests}
        onSendRequest={onSendRequest}
        onSendRequestByUid={onSendRequestByUid}
        onRespond={onRespond}
      />
      <FriendSuggestions suggestions={suggestions} loading={suggestionsLoading} onAdd={onSendRequestByUid} />
    </SocialSheet>
  );
}
