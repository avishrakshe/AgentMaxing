import nebula from "./nebula-chain.json";
import orbit from "./orbit-l2.json";

export type FixtureTweet = {
  id: string;
  author: string;
  text: string;
  createdAt: string;
  links: string[];
  media: string[];
  inReplyTo?: string;
};

export const fixtures: { ecosystem: string; listId: string; tweets: FixtureTweet[] }[] = [nebula, orbit];
