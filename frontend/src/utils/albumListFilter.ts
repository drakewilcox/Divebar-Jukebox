/** Sort option for admin album lists (Collection Manager & Library Scanner). */
export type AlbumSortOption =
  | 'artist_asc'
  | 'artist_desc'
  | 'title_asc'
  | 'title_desc'
  | 'date_added_asc'
  | 'date_added_desc'
  | 'year_asc'
  | 'year_desc';

export function filterAndSortAlbums(
  albums: any[],
  searchQuery: string,
  sortBy: AlbumSortOption
): any[] {
  const q = searchQuery.trim().toLowerCase();
  let list = q
    ? albums.filter(
        (a) =>
          (a.title ?? '').toLowerCase().includes(q) ||
          (a.artist ?? '').toLowerCase().includes(q)
      )
    : [...albums];

  const cmpTitle = (a: any, b: any) =>
    (a.title ?? '').localeCompare(b.title ?? '', undefined, { sensitivity: 'base' });
  const cmpArtist = (a: any, b: any) =>
    (a.artist ?? '').localeCompare(b.artist ?? '', undefined, { sensitivity: 'base' });
  const cmpDate = (a: any, b: any) =>
    new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime();
  const cmpYear = (a: any, b: any) => (a.year ?? 0) - (b.year ?? 0);

  switch (sortBy) {
    case 'artist_asc':
      list.sort((a, b) => cmpArtist(a, b));
      break;
    case 'artist_desc':
      list.sort((a, b) => -cmpArtist(a, b));
      break;
    case 'title_asc':
      list.sort((a, b) => cmpTitle(a, b));
      break;
    case 'title_desc':
      list.sort((a, b) => -cmpTitle(a, b));
      break;
    case 'date_added_asc':
      list.sort(cmpDate);
      break;
    case 'date_added_desc':
      list.sort((a, b) => -cmpDate(a, b));
      break;
    case 'year_asc':
      list.sort(cmpYear);
      break;
    case 'year_desc':
      list.sort((a, b) => -cmpYear(a, b));
      break;
    default:
      list.sort((a, b) => cmpArtist(a, b));
  }
  return list;
}
