# 4. SQL Revision

## Core syntax order
`SELECT ... FROM ... JOIN ... ON ... WHERE ... GROUP BY ... HAVING ... ORDER BY ... LIMIT`
Execution order: FROM -> JOIN -> WHERE -> GROUP BY -> HAVING -> SELECT -> DISTINCT -> ORDER BY -> LIMIT.

- **WHERE** filters rows (before grouping); **HAVING** filters groups (after).
- **JOINs**: INNER (matching), LEFT (all left + matches), RIGHT, FULL, CROSS, SELF join.
- `NULL` comparisons use `IS NULL`; `COUNT(*)` counts rows, `COUNT(col)` skips NULLs.
- **DELETE** (rows, rollback-able, WHERE) vs **TRUNCATE** (all rows, DDL, fast) vs **DROP** (removes table).
- **UNION** (dedup) vs **UNION ALL**. **IN** vs **EXISTS**. **CHAR** vs **VARCHAR**.
- **Keys**: primary, foreign, unique, composite, candidate. **Normalization**: 1NF atomic values; 2NF no partial dependency; 3NF no transitive dependency; BCNF.
- **ACID**: Atomicity, Consistency, Isolation, Durability. **Indexes** speed reads, slow writes.
- **Views**, **stored procedures**, **triggers**, **transactions** (COMMIT/ROLLBACK/SAVEPOINT).

## Practice schema
```sql
Employee(emp_id, name, salary, dept_id, manager_id, hire_date)
Department(dept_id, dept_name)
Orders(order_id, customer_id, amount, order_date)
```

## Must-know questions (write the query yourself first)
1. **2nd highest salary**
```sql
SELECT MAX(salary) FROM Employee WHERE salary < (SELECT MAX(salary) FROM Employee);
-- or: SELECT DISTINCT salary FROM Employee ORDER BY salary DESC LIMIT 1 OFFSET 1;
```
2. **Nth highest salary (window)**
```sql
SELECT salary FROM (SELECT salary, DENSE_RANK() OVER (ORDER BY salary DESC) r FROM Employee) t WHERE r = N;
```
3. **Duplicate rows**
```sql
SELECT name, COUNT(*) FROM Employee GROUP BY name HAVING COUNT(*) > 1;
```
4. **Delete duplicates keeping one**
```sql
DELETE FROM Employee WHERE emp_id NOT IN (SELECT MIN(emp_id) FROM Employee GROUP BY name);
-- MySQL needs a derived table wrapper: NOT IN (SELECT id FROM (SELECT MIN(emp_id) id FROM Employee GROUP BY name) x)
```
5. **Employees earning more than their manager** (self join)
```sql
SELECT e.name FROM Employee e JOIN Employee m ON e.manager_id = m.emp_id WHERE e.salary > m.salary;
```
6. **Department-wise highest salary**
```sql
SELECT d.dept_name, MAX(e.salary) FROM Employee e JOIN Department d ON e.dept_id = d.dept_id GROUP BY d.dept_name;
```
7. **Top earner per department**
```sql
SELECT * FROM (SELECT *, RANK() OVER (PARTITION BY dept_id ORDER BY salary DESC) r FROM Employee) t WHERE r = 1;
```
8. **Departments with no employees**
```sql
SELECT d.dept_name FROM Department d LEFT JOIN Employee e ON d.dept_id = e.dept_id WHERE e.emp_id IS NULL;
```
9. **Customers who never ordered** - same LEFT JOIN + IS NULL pattern, or `NOT EXISTS`.
10. **Running total**
```sql
SELECT order_date, amount, SUM(amount) OVER (ORDER BY order_date) AS running_total FROM Orders;
```
11. **Month-wise revenue**
```sql
SELECT DATE_FORMAT(order_date,'%Y-%m') m, SUM(amount) FROM Orders GROUP BY m;
```
12. **Departments with more than 5 employees**: `GROUP BY dept_id HAVING COUNT(*) > 5`.
13. **Average salary above company average**: `WHERE salary > (SELECT AVG(salary) FROM Employee)`.
14. **Consecutive/previous row compare**: `LAG(amount) OVER (ORDER BY order_date)`.
15. **Employees hired in last 30 days**, **names starting with 'A'** (`LIKE 'A%'`), **CASE WHEN** bucketing:
```sql
SELECT name, CASE WHEN salary >= 100000 THEN 'High' WHEN salary >= 50000 THEN 'Mid' ELSE 'Low' END band FROM Employee;
```

## Window function cheat
`ROW_NUMBER()` unique sequence; `RANK()` ties share rank, gaps after; `DENSE_RANK()` ties share rank, no gaps; `LAG/LEAD`; `SUM() OVER`.

## Where to practice (do 25 problems total)
LeetCode SQL 50 study plan; HackerRank SQL (Basic/Intermediate); SQLZoo; DataLemur.
Link to Salesforce: SOQL is a *subset* of SQL (no arbitrary joins, no `SELECT *`, relationship queries instead). Be ready to compare.
