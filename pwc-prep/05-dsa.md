# 5. DSA Revision (PwC Technical: expect easy-medium)

Time budget: 2-3 problems/day, 25-30 min each. Write in the language you're strongest at (Java/Python/C++). **Talk through brute force -> optimized, state time/space complexity.**

## Patterns and problems
| Pattern | Problems |
|---|---|
| Arrays / hashing | Two Sum, Contains Duplicate, Valid Anagram, Group Anagrams, Longest Consecutive Sequence, Product of Array Except Self, Move Zeroes, Maximum Subarray (Kadane) |
| Two pointers | Valid Palindrome, 3Sum, Container With Most Water, Remove Duplicates from Sorted Array, Merge Sorted Arrays |
| Sliding window | Best Time to Buy/Sell Stock, Longest Substring Without Repeating Characters, Maximum Sum Subarray of size K |
| Binary search | Binary Search, Search in Rotated Sorted Array, First/Last Position, Square root |
| Strings | Reverse String, Palindrome check, Longest Common Prefix, String Compression, Count vowels/frequency, Anagram |
| Linked list | Reverse List, Detect Cycle (Floyd), Merge Two Sorted Lists, Middle of List, Remove Nth from End |
| Stack/Queue | Valid Parentheses, Min Stack, Next Greater Element, Queue using Stacks |
| Trees | Inorder/Preorder/Postorder, Level Order (BFS), Max Depth, Invert Tree, Validate BST, LCA |
| Graphs | BFS/DFS, Number of Islands, Cycle detection, Course Schedule (topo sort) |
| Recursion / Backtracking | Fibonacci, Factorial, Subsets, Permutations, Power(x,n) |
| DP (basics) | Climbing Stairs, House Robber, Coin Change, LIS, 0/1 Knapsack, LCS |
| Sorting | Bubble/Selection/Insertion, Merge sort, Quick sort - know the complexities |

## Complexities to memorize
- Array access O(1), search O(n), HashMap get/put O(1) avg, BST balanced O(log n), heap push/pop O(log n).
- Merge sort O(n log n) time, O(n) space; Quick sort avg O(n log n), worst O(n^2); Binary search O(log n).

## Classic one-liners to rehearse
- **Two Sum**: HashMap value->index in one pass.
- **Reverse linked list**: prev/curr/next pointers.
- **Valid parentheses**: stack + matching map.
- **Kadane**: `cur = max(x, cur + x); best = max(best, cur)`.
- **Fibonacci with memo / bottom-up** to show DP basics.

## Also revise (CS fundamentals, 1 h each)
- **OOP**: encapsulation, inheritance, polymorphism, abstraction; overloading vs overriding; abstract class vs interface.
- **DBMS**: normalization, ACID, indexing, joins, transactions (see SQL file).
- **OS**: process vs thread, deadlock (4 conditions), scheduling, paging, semaphore/mutex.
- **Networks**: OSI/TCP-IP layers, HTTP vs HTTPS, REST (GET/POST/PUT/DELETE), status codes, DNS.
- **Java/Python basics** (whichever is on your resume): collections, exceptions, memory management.

Practice sites: LeetCode (Easy/Medium, "Top Interview 150"), NeetCode 150, GeeksforGeeks.
