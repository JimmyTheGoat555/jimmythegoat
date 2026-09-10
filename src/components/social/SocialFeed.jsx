import FeedPostCard from './FeedPostCard';

// `posts` is useFeed(friends).posts — already ordered newest-first by the
// query itself (see hooks/useFeed.js). This component just handles the
// three "nothing to show" states; FeedPostCard does the actual per-post
// rendering + cheer button.
export default function SocialFeed({ posts, loading, error, hasFriends, myUid }) {
  if (!hasFriends) {
    return (
      <p className="text-sm text-neutral-500 px-1">
        Add a friend above to see their workouts here.
      </p>
    );
  }

  if (error) {
    return <p className="text-sm text-[var(--danger)] px-1">Couldn't load the feed — try again in a bit.</p>;
  }

  if (loading) {
    return <p className="text-sm text-neutral-500 px-1">Loading feed…</p>;
  }

  if (posts.length === 0) {
    return (
      <p className="text-sm text-neutral-500 px-1">
        No workouts from friends yet — nudge them to log one!
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {posts.map((post) => (
        <FeedPostCard key={post.id} post={post} myUid={myUid} />
      ))}
    </div>
  );
}
