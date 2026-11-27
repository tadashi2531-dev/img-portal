export function hotelSearchLinks(input: { address: string; checkIn: string | null; checkOut: string | null; partySize: number }): {
  rakuten: string;
  jalan: string;
  google: string;
} {
  const place = input.address.trim() || "ホテル";
  const stay = [input.checkIn, input.checkOut].filter(Boolean).join(" ");
  const query = [place, stay, `${input.partySize}名`].filter(Boolean).join(" ");
  return {
    rakuten: `https://kw.travel.rakuten.co.jp/keyword/Search.do?f_query=${encodeURIComponent(query)}`,
    jalan: `https://www.jalan.net/uw/uwp2011/uww2011init.do?keyword=${encodeURIComponent(place)}`,
    google: `https://www.google.com/travel/search?q=${encodeURIComponent(`${query} ホテル`)}`,
  };
}
