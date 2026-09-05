import { Link } from 'waku';

export const Feed = () => {
  const photos = Array.from({ length: 6 }, (_, i) => i + 1);

  return (
    <section className="cards-container">
      {photos.map((id) => (
        <Link
          className="card"
          key={id}
          to={{ to: '/photos/[id]', params: { id: String(id) } }}
        >
          {id}
        </Link>
      ))}
    </section>
  );
};
