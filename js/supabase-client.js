/**
 * GrowOn — Supabase Configuration
 *
 * Replace SUPABASE_URL and SUPABASE_ANON with your project values.
 * Find them at: https://app.supabase.com → Project Settings → API
 *
 * These are SAFE to commit — the anon key is public by design.
 * Row Level Security (RLS) on Supabase controls what users can actually do.
 *
 * NOTE: The Supabase CDN script must be loaded before this file.
 *       It is included in <head> on every page to guarantee this.
 */

const SUPABASE_URL  = 'https://uiygynwdzlvmtkledfpg.supabase.co';
const SUPABASE_ANON = 'sb_publishable_GS7cNvoOdQQAar1Kz5pkkQ_8EQthPNq';

// Guard: fail with a clear message if the CDN bundle didn't load
if (typeof supabase === 'undefined') {
  throw new Error(
    '[GrowOn] Supabase CDN script not loaded. ' +
    'Make sure the supabase-js <script> tag appears in <head> before supabase-client.js.'
  );
}

const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

/* ── Auth helpers ── */

async function getSession() {
  const { data } = await db.auth.getSession();
  return data.session;
}

async function getUser() {
  const { data } = await db.auth.getUser();
  return data.user;
}

async function signUp(email, password, meta = {}) {
  // Build the confirmation redirect URL dynamically so it works on both
  // localhost (dev) and the live GitHub Pages URL without any config change.
  const confirmUrl = window.location.origin + window.location.pathname.replace(/\/[^/]*$/, '/') + 'confirm.html';
  return db.auth.signUp({
    email,
    password,
    options: {
      data: meta,
      emailRedirectTo: confirmUrl,
    },
  });
}

async function signIn(email, password) {
  return db.auth.signInWithPassword({ email, password });
}

async function signOut() {
  return db.auth.signOut();
}

/* ── Items ── */

async function fetchItems(filters = {}) {
  let q = db.from('items')
    .select('*, profiles(display_name, suburb)')
    .eq('status', 'available')
    .order('created_at', { ascending: false });

  if (filters.gender && filters.gender !== 'all')
    q = q.eq('gender', filters.gender);
  if (filters.size_group)
    q = q.eq('size_group', filters.size_group);
  if (filters.category)
    q = q.eq('category', filters.category);
  if (filters.condition)
    q = q.eq('condition', filters.condition);

  const { data, error } = await q;
  if (error) throw error;
  return data;
}

async function fetchItemById(id) {
  const { data, error } = await db
    .from('items')
    .select('*, profiles(display_name, suburb)')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

async function submitItem(itemData) {
  const user = await getUser();
  if (!user) throw new Error('Must be signed in to contribute');

  const { data, error } = await db
    .from('items')
    .insert({ ...itemData, contributor_id: user.id, status: 'pending' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/* ── Claims ── */

async function claimItem(itemId, pointCost) {
  const user = await getUser();
  if (!user) throw new Error('Must be signed in to claim');

  // Uses a Supabase DB function to handle the atomic point transfer
  const { data, error } = await db.rpc('claim_item', {
    p_item_id:    itemId,
    p_user_id:    user.id,
    p_point_cost: pointCost,
  });
  if (error) throw error;
  return data;
}

/* ── User profile & points ── */

async function fetchProfile(userId) {
  const { data, error } = await db
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) throw error;
  return data;
}

async function fetchActivity(userId, limit = 20) {
  const { data, error } = await db
    .from('transactions')
    .select('*, items(title, emoji)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

async function fetchWishlist(userId) {
  const { data, error } = await db
    .from('wishlist')
    .select('*')
    .eq('user_id', userId);
  if (error) throw error;
  return data;
}

async function addWishlistItem(entry) {
  const user = await getUser();
  const { data, error } = await db
    .from('wishlist')
    .insert({ ...entry, user_id: user.id });
  if (error) throw error;
  return data;
}

/* ── Volunteer admin ── */

async function fetchPendingItems() {
  const { data, error } = await db
    .from('items')
    .select('*, profiles(display_name, suburb, points_balance)')
    .eq('status', 'pending')
    .order('created_at', { ascending: true }); // oldest first
  if (error) throw error;
  return data;
}

async function approveItem(itemId, pointCost, notes = null) {
  const { error } = await db.rpc('approve_item', {
    p_item_id:    itemId,
    p_point_cost: pointCost,
    p_notes:      notes,
  });
  if (error) throw error;
}

async function rejectItem(itemId, reason) {
  const { error } = await db
    .from('items')
    .update({ status: 'rejected', volunteer_notes: reason, updated_at: new Date().toISOString() })
    .eq('id', itemId);
  if (error) throw error;
}

async function fetchAllMembers() {
  const { data, error } = await db
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

async function setVolunteerStatus(userId, isVolunteer) {
  const { error } = await db
    .from('profiles')
    .update({ is_volunteer: isVolunteer })
    .eq('id', userId);
  if (error) throw error;
}

/* ── Points calculator (mirrors DB formula) ── */

function calculatePoints(sizeBase, conditionMultiplier, materialBonus, isBranded) {
  let pts = sizeBase * conditionMultiplier * materialBonus;
  if (isBranded) pts *= 1.15;
  return Math.round(pts);
}

const SIZE_BASE = {
  'newborn': 10, '0-1': 12, '2-3': 14,
  '4-5': 17, '6-8': 20, '10-14': 24,
};
const CONDITION_MULT  = { excellent: 1.0, good: 0.7, fair: 0.4 };
const MATERIAL_BONUS  = {
  'cotton-synthetic': 1.0, 'cotton': 1.2,
  'merino': 1.3, 'organic-cotton': 1.25, 'synthetic': 1.0,
};
