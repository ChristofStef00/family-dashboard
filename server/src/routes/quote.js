import { Router } from 'express';

const router = Router();

const QUOTES = [
  { text: 'The best way to find out if you can trust somebody is to trust them.', author: 'Ernest Hemingway' },
  { text: 'It is during our darkest moments that we must focus to see the light.', author: 'Aristotle' },
  { text: 'Whoever is happy will make others happy too.', author: 'Anne Frank' },
  { text: 'Do not go where the path may lead, go instead where there is no path and leave a trail.', author: 'Ralph Waldo Emerson' },
  { text: 'You will face many defeats in life, but never let yourself be defeated.', author: 'Maya Angelou' },
  { text: 'The future belongs to those who believe in the beauty of their dreams.', author: 'Eleanor Roosevelt' },
  { text: 'Tell me and I forget. Teach me and I remember. Involve me and I learn.', author: 'Benjamin Franklin' },
  { text: 'The only impossible journey is the one you never begin.', author: 'Tony Robbins' },
  { text: 'Life is what happens when you’re busy making other plans.', author: 'John Lennon' },
  { text: 'In the end, we will remember not the words of our enemies, but the silence of our friends.', author: 'Martin Luther King Jr.' }
];

router.get('/', (_req, res) => {
  const day = Math.floor(Date.now() / (24 * 3600 * 1000));
  const q = QUOTES[day % QUOTES.length];
  res.json(q);
});

export default router;
