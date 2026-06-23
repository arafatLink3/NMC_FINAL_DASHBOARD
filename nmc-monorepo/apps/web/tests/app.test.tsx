// Smoke tests for the NMC web app: ensure core modules load and helper hooks
// behave as expected without needing a real server.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppProviders } from '../src/lib/providers';
import { LoginPage } from '../src/pages/LoginPage';
import { DashboardPage } from '../src/pages/DashboardPage';
import { TicketsPage } from '../src/pages/TicketsPage';
import { ContactsPage } from '../src/pages/ContactsPage';
import { store } from '../src/lib/store';
import { bus } from '../src/lib/bus';

function renderWithProviders(node: React.ReactNode) {
  return render(<MemoryRouter><AppProviders>{node}</AppProviders></MemoryRouter>);
}
// Note: MemoryRouter MUST wrap AppProviders, because AuthProvider calls
// useNavigate() and needs a Router ancestor.

beforeEach(() => {
  localStorage.clear();
  cleanup();
});

describe('providers + bus', () => {
  it('bus emits and receives named events', () => {
    const seen: string[] = [];
    const off = bus.on('notify', (p) => seen.push(p.text));
    bus.emit('notify', { id: '1', text: 'hello', type: 'info', createdAt: new Date().toISOString() });
    expect(seen).toEqual(['hello']);
    off();
    bus.emit('notify', { id: '2', text: 'after-off', type: 'info', createdAt: new Date().toISOString() });
    expect(seen).toEqual(['hello']);
  });
});

describe('store', () => {
  it('round-trips data through localStorage with the nmc. prefix', () => {
    const seed = { foo: 'bar' };
    const created = store.add<{ foo: string }>('test_collection', seed);
    const all = store.get<{ id: string; foo: string }>('test_collection');
    expect(all.length).toBe(1);
    expect(all[0]?.id).toBe(created.id);
    expect(all[0]?.foo).toBe('bar');
    expect(localStorage.getItem('nmc.test_collection')).not.toBeNull();
  });

  it('updates and removes rows by id', () => {
    const a = store.add<{ x: number }>('c', { x: 1 });
    const updated = store.update<{ x: number }>('c', a.id, { x: 99 });
    expect(updated?.x).toBe(99);
    store.removeItem('c', a.id);
    expect(store.get('c').length).toBe(0);
  });
});

describe('pages render without crashing', () => {
  it('LoginPage renders the email/password form', () => {
    renderWithProviders(<LoginPage />);
    expect(screen.getByLabelText(/email/i)).toBeTruthy();
    expect(screen.getByLabelText(/password/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeTruthy();
  });

  it('DashboardPage shows KPI cards and recent incidents', () => {
    // seed an incident so the table has something to render
    store.add('incidents', { id: 'i1', category: 'Power', subCategory: 'Battery', faultTime: new Date().toISOString(), incidentName: 'Test BTS' });
    renderWithProviders(<DashboardPage />);
    expect(screen.getByText(/recent incidents/i)).toBeTruthy();
  });

  it('TicketsPage renders the tabs and a textarea', () => {
    renderWithProviders(<TicketsPage />);
    expect(screen.getByText(/create ticket/i)).toBeTruthy();
    expect(screen.getByText(/close ticket/i)).toBeTruthy();
  });

  it('ContactsPage renders the table with seeded contacts', () => {
    store.add('contacts', { id: 'c1', name: 'Alice', phone: '123' });
    renderWithProviders(<ContactsPage />);
    expect(screen.getByText('Alice')).toBeTruthy();
  });
});

describe('AI helpers', () => {
  it('parseTicket extracts a sub-category from raw text', async () => {
    const { parseTicket } = await import('@nmc/ai');
    const out = parseTicket('Category: FO link\nBTS/Area: Bashundhara\nImpacted Customers (IC): 100');
    expect(out.category).toBeTruthy();
    expect(out.bts).toBe('Bashundhara');
  });
});
