import { describe, expect, it, vi } from 'vitest';
import { fireEvent } from '@testing-library/react';
import { DataTable, type DataTableColumn } from '../src/primitives/DataTable.js';
import { renderWithTheme } from './test-utils.js';

interface Row {
  id: string;
  name: string;
  count: number;
}

const rows: Row[] = [
  { id: '1', name: 'Alpha', count: 3 },
  { id: '2', name: 'Bravo', count: 7 },
  { id: '3', name: 'Charlie', count: 1 },
];

const columns: DataTableColumn<Row>[] = [
  { key: 'name', header: 'Name' },
  { key: 'count', header: 'Count', align: 'right' },
];

describe('DataTable', () => {
  it('renders headers and stringified cells by default', () => {
    const { getByText } = renderWithTheme(
      <DataTable<Row> columns={columns} rows={rows} testID="t" />,
    );
    expect(getByText('Name')).toBeTruthy();
    expect(getByText('Count')).toBeTruthy();
    expect(getByText('Alpha')).toBeTruthy();
    expect(getByText('Bravo')).toBeTruthy();
    expect(getByText('Charlie')).toBeTruthy();
    expect(getByText('3')).toBeTruthy();
    expect(getByText('7')).toBeTruthy();
  });

  it('shows the empty slot when there are no rows', () => {
    const { getByText } = renderWithTheme(
      <DataTable<Row> columns={columns} rows={[]} empty="Nothing here" testID="t" />,
    );
    expect(getByText('Nothing here')).toBeTruthy();
  });

  it('falls back to the default empty text', () => {
    const { getByText } = renderWithTheme(
      <DataTable<Row> columns={columns} rows={[]} testID="t" />,
    );
    expect(getByText('No data')).toBeTruthy();
  });

  it('uses the custom render function when provided', () => {
    const cols: DataTableColumn<Row>[] = [
      { key: 'name', header: 'Name' },
      {
        key: 'count',
        header: 'Count',
        render: (r) => `×${r.count}`,
      },
    ];
    const { getByText } = renderWithTheme(
      <DataTable<Row> columns={cols} rows={rows} testID="t" />,
    );
    expect(getByText('×3')).toBeTruthy();
    expect(getByText('×7')).toBeTruthy();
  });

  it('fires onRowPress with the row and its index', () => {
    const onRowPress = vi.fn();
    const { getByText } = renderWithTheme(
      <DataTable<Row>
        columns={columns}
        rows={rows}
        onRowPress={onRowPress}
        testID="t"
      />,
    );
    fireEvent.click(getByText('Bravo'));
    expect(onRowPress).toHaveBeenCalledTimes(1);
    const [row, idx] = onRowPress.mock.calls[0]!;
    expect(row.id).toBe('2');
    expect(idx).toBe(1);
  });

  it('does not crash when keyOf is provided and uses it for keys', () => {
    const { getByText } = renderWithTheme(
      <DataTable<Row>
        columns={columns}
        rows={rows}
        keyOf={(r) => r.id}
        testID="t"
      />,
    );
    expect(getByText('Alpha')).toBeTruthy();
    expect(getByText('Bravo')).toBeTruthy();
    expect(getByText('Charlie')).toBeTruthy();
  });
});
