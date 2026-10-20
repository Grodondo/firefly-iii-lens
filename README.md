# Firefly Lens

An interactive viewer for [Firefly III](https://www.firefly-iii.org/) transaction exports. It turns the CSV export into charts and tables for seeing where your money is and where it goes, without running another server or container.

Everything runs locally in the browser. The CSV is read on your machine and never uploaded or stored.

## Usage

1. In Firefly III, export your transactions as CSV (**Export data**).
2. Open `index.html` in a browser (double-click it). No install, build step or internet connection is needed.
3. Drop the CSV onto the page, or click to choose it. Several files can be loaded at once and are merged.
4. Explore, then close the tab. Use **Open CSV** in the top bar to load another file.

## Views

| View | Shows |
| --- | --- |
| Overview | KPIs vs. the previous period, net worth over time, income vs. expenses, spending breakdown |
| Accounts | Balance per account, balances over time, activity and transfers |
| Cash flow | Sankey diagram: income source → account → spending |
| Spending & income | Treemap, ranking, trend, daily calendar, weekday averages, group table |
| Insights | Recurring payments, month-end projection, spending pace, monthly summary |
| Transactions | Sortable table, detail panel, export of the filtered rows to CSV |

## Interacting

- **Filter:** use the sidebar (period, accounts, categories, tags, bills, budgets) or the search box. Active filters appear as chips that can be removed individually.
- **Click** a chart element, legend entry or list row to filter by it. Every view updates.
- **Drag** across a time chart to zoom into that period.
- **Group by:** the Spending & income view and several chart headers can group by category, tag, budget, bill, payee, description, account or weekday.

## Notes

- Opening balances count towards balances and net worth, but not towards income or expenses.
- One currency is shown at a time. Use the currency selector in the sidebar if the export contains several.
- Transfers between your own accounts are not counted as income or spending.
- Browsers with `Intl` and CSS `color-mix` support are required (any current Chrome, Edge, Firefox or Safari).

## Project layout

```
index.html        page shell
css/styles.css    styling (light and dark themes)
js/csv.js         CSV parser
js/model.js       data normalisation, filtering and aggregation
js/charts.js      dependency-free SVG/HTML charts
js/views.js       Overview, Accounts, Cash flow
js/views2.js      Spending & income, Insights, Transactions
js/app.js         state, sidebar, filters, file loading
```
