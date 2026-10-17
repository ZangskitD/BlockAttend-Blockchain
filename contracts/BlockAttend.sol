// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title BlockAttend
/// @notice On-chain course enrolment, session attendance and exam eligibility.
contract BlockAttend {
    address public immutable institutionAdmin;
    uint256 public nextCourseId = 1;
    uint256 public nextSessionId = 1;

    enum Role { None, Faculty, Student }

    struct User {
        Role role;
        bool active;
    }

    struct Course {
        uint256 id;
        address faculty;
        string name;
        string code;
        string description;
        string semester;
        string schedule;
        uint8 threshold;
        bool active;
        uint256 totalSessions;
    }

    struct Session {
        uint256 id;
        uint256 courseId;
        uint64 expiresAt;
        bool open;
        bool counted;
    }

    mapping(address => User) public users;
    mapping(uint256 => Course) private courses;
    mapping(uint256 => Session) public sessions;
    mapping(uint256 => uint256[]) private courseSessionIds;
    mapping(uint256 => uint256[]) private courseStudentList;
    mapping(uint256 => mapping(address => bool)) public approved;
    mapping(uint256 => mapping(address => bool)) public enrolled;
    mapping(uint256 => mapping(address => bool)) public enrollmentRequested;
    mapping(uint256 => mapping(address => bool)) public attendance;
    mapping(uint256 => mapping(address => uint256)) public attendedCount;
    mapping(uint256 => mapping(address => bool)) public studentListed;
    uint256[] private allCourseIds;
    mapping(uint256 => mapping(address => uint256)) private studentCourseAttendance;
    mapping(uint256 => mapping(address => bool)) public sessionCancelled;

    event UserRegistered(address indexed wallet, Role role);
    event CourseCreated(uint256 indexed courseId, address indexed faculty, string code);
    event StudentApproved(uint256 indexed courseId, address indexed student);
    event EnrollmentRequested(uint256 indexed courseId, address indexed student);
    event StudentEnrolled(uint256 indexed courseId, address indexed student);
    event StudentRemoved(uint256 indexed courseId, address indexed student);
    event SessionStarted(uint256 indexed sessionId, uint256 indexed courseId, uint64 expiresAt);
    event SessionClosed(uint256 indexed sessionId, uint256 indexed courseId);
    event AttendanceRecorded(uint256 indexed sessionId, uint256 indexed courseId, address indexed student);
    event ThresholdChanged(uint256 indexed courseId, uint8 threshold);

    error Unauthorized();
    error InvalidInput();
    error NotFound();
    error NotApproved();
    error AlreadyDone();
    error SessionUnavailable();

  constructor() {
    institutionAdmin = msg.sender;

    // Allow the deploying admin wallet to use the Faculty workspace.
    users[msg.sender] = User(Role.Faculty, true);

    emit UserRegistered(msg.sender, Role.Faculty);
}

    modifier onlyAdmin() {
        if (msg.sender != institutionAdmin) revert Unauthorized();
        _;
    }

    modifier onlyFaculty() {
        if (users[msg.sender].role != Role.Faculty || !users[msg.sender].active) revert Unauthorized();
        _;
    }

    modifier onlyStudent() {
        if (users[msg.sender].role != Role.Student || !users[msg.sender].active) revert Unauthorized();
        _;
    }

    function registerStudent() external {
        if (users[msg.sender].active) revert AlreadyDone();
        users[msg.sender] = User(Role.Student, true);
        emit UserRegistered(msg.sender, Role.Student);
    }

    /// @dev Only institution admin can grant faculty privileges.
    function authorizeFaculty(address wallet) external onlyAdmin {
        if (wallet == address(0)) revert InvalidInput();
        users[wallet] = User(Role.Faculty, true);
        emit UserRegistered(wallet, Role.Faculty);
    }

    function revokeUser(address wallet) external onlyAdmin {
        users[wallet].active = false;
    }

    function createCourse(
        string calldata name,
        string calldata code,
        string calldata description,
        string calldata semester,
        string calldata schedule,
        uint8 threshold
    ) external onlyFaculty returns (uint256 id) {
        if (bytes(name).length == 0 || bytes(code).length == 0 || threshold > 100) revert InvalidInput();
        id = nextCourseId++;
        courses[id] = Course(id, msg.sender, name, code, description, semester, schedule, threshold, true, 0);
        allCourseIds.push(id);
        emit CourseCreated(id, msg.sender, code);
    }

    function getCourse(uint256 id) external view returns (Course memory) {
        if (courses[id].id == 0) revert NotFound();
        return courses[id];
    }

    function getAllCourseIds() external view returns (uint256[] memory) {
        return allCourseIds;
    }

    function getMyCourseIds() external view returns (uint256[] memory result) {
        uint256 count;
        for (uint256 i; i < allCourseIds.length; i++) {
            Course storage c = courses[allCourseIds[i]];
            if (c.faculty == msg.sender || enrolled[c.id][msg.sender] || approved[c.id][msg.sender] || enrollmentRequested[c.id][msg.sender]) count++;
        }
        result = new uint256[](count);
        uint256 j;
        for (uint256 i; i < allCourseIds.length; i++) {
            Course storage c = courses[allCourseIds[i]];
            if (c.faculty == msg.sender || enrolled[c.id][msg.sender] || approved[c.id][msg.sender] || enrollmentRequested[c.id][msg.sender]) {
                result[j++] = c.id;
            }
        }
    }

    function approveStudent(uint256 courseId, address student) external {
        Course storage c = courses[courseId];
        if (c.id == 0) revert NotFound();
        if (c.faculty != msg.sender) revert Unauthorized();
        if (users[student].role != Role.Student || !users[student].active) revert NotApproved();
        approved[courseId][student] = true;
        emit StudentApproved(courseId, student);
    }

    function requestEnrollment(uint256 courseId) external onlyStudent {
        if (courses[courseId].id == 0 || !courses[courseId].active) revert NotFound();
        if (enrolled[courseId][msg.sender]) revert AlreadyDone();
        enrollmentRequested[courseId][msg.sender] = true;
        emit EnrollmentRequested(courseId, msg.sender);
    }

    function enroll(uint256 courseId) external onlyStudent {
        Course storage c = courses[courseId];
        if (c.id == 0 || !c.active) revert NotFound();
        if (!approved[courseId][msg.sender]) revert NotApproved();
        if (enrolled[courseId][msg.sender]) revert AlreadyDone();
        enrolled[courseId][msg.sender] = true;
        enrollmentRequested[courseId][msg.sender] = false;
        if (!studentListed[courseId][msg.sender]) {
            studentListed[courseId][msg.sender] = true;
            courseStudentList[courseId].push(uint256(uint160(msg.sender)));
        }
        emit StudentEnrolled(courseId, msg.sender);
    }

    function removeStudent(uint256 courseId, address student) external {
        Course storage c = courses[courseId];
        if (c.faculty != msg.sender) revert Unauthorized();
        if (!enrolled[courseId][student]) revert NotFound();
        enrolled[courseId][student] = false;
        emit StudentRemoved(courseId, student);
    }

    function getCourseStudents(uint256 courseId) external view returns (address[] memory result) {
        uint256[] storage raw = courseStudentList[courseId];
        uint256 count;
        for (uint256 i; i < raw.length; i++) if (enrolled[courseId][address(uint160(raw[i]))]) count++;
        result = new address[](count);
        uint256 j;
        for (uint256 i; i < raw.length; i++) {
            address a = address(uint160(raw[i]));
            if (enrolled[courseId][a]) result[j++] = a;
        }
    }

    function startSession(uint256 courseId, uint32 durationMinutes) external onlyFaculty returns (uint256 id) {
        Course storage c = courses[courseId];
        if (c.id == 0 || c.faculty != msg.sender) revert Unauthorized();
        if (durationMinutes == 0 || durationMinutes > 240) revert InvalidInput();
        id = nextSessionId++;
        uint64 expiry = uint64(block.timestamp + uint256(durationMinutes) * 60);
        sessions[id] = Session(id, courseId, expiry, true, true);
        courseSessionIds[courseId].push(id);
        c.totalSessions++;
        emit SessionStarted(id, courseId, expiry);
    }

    function closeSession(uint256 sessionId) external {
        Session storage s = sessions[sessionId];
        Course storage c = courses[s.courseId];
        if (s.id == 0) revert NotFound();
        if (c.faculty != msg.sender) revert Unauthorized();
        s.open = false;
        emit SessionClosed(sessionId, s.courseId);
    }

    function markAttendance(uint256 sessionId) external onlyStudent {
        Session storage s = sessions[sessionId];
        if (s.id == 0 || !s.open || block.timestamp > s.expiresAt || !enrolled[s.courseId][msg.sender]) revert SessionUnavailable();
        if (attendance[sessionId][msg.sender]) revert AlreadyDone();
        attendance[sessionId][msg.sender] = true;
        attendedCount[s.courseId][msg.sender]++;
        emit AttendanceRecorded(sessionId, s.courseId, msg.sender);
    }

    function setThreshold(uint256 courseId, uint8 threshold) external {
        Course storage c = courses[courseId];
        if (c.faculty != msg.sender) revert Unauthorized();
        if (threshold > 100) revert InvalidInput();
        c.threshold = threshold;
        emit ThresholdChanged(courseId, threshold);
    }

    function getSessionIds(uint256 courseId) external view returns (uint256[] memory) {
        return courseSessionIds[courseId];
    }

    function getStudentStats(uint256 courseId, address student) external view returns (
        uint256 attended, uint256 total, uint256 percentage, uint8 threshold, bool eligible
    ) {
        Course storage c = courses[courseId];
        if (c.id == 0) revert NotFound();
        attended = attendedCount[courseId][student];
        total = c.totalSessions;
        percentage = total == 0 ? 0 : (attended * 100) / total;
        threshold = c.threshold;
        eligible = total > 0 && percentage >= threshold;
    }

    function getSession(uint256 sessionId) external view returns (Session memory) {
        if (sessions[sessionId].id == 0) revert NotFound();
        return sessions[sessionId];
    }
}
