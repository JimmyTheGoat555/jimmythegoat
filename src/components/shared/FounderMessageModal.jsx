import { useFounderMessage } from '../../hooks/useFounderMessage';
import FounderMessageSheet from './FounderMessageSheet';

// The founder's direct message, over whatever tab is open (App.jsx's
// Layout mounts it beside the announcement banner). Reads its own data
// (hooks/useFounderMessage.js) so mounting it is the whole integration;
// renders nothing until there is an unread message for THIS account.
export default function FounderMessageModal() {
  const { message, markRead } = useFounderMessage();
  return <FounderMessageSheet message={message} onRead={markRead} />;
}
