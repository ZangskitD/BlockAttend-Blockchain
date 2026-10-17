import { expect } from "chai";
import hre from "hardhat";
const { ethers } = hre;

describe("BlockAttend", function () {
  async function setup() {
    const [admin, faculty, student, outsider] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("BlockAttend");
    const c = await Factory.deploy();
    await c.waitForDeployment();
    await c.authorizeFaculty(faculty.address);
    await c.connect(student).registerStudent();
    await c.connect(faculty).createCourse("Blockchain", "CS425", "Course", "Fall 2026", "Mon 10:00", 75);
    await c.connect(faculty).approveStudent(1, student.address);
    await c.connect(student).enroll(1);
    return { c, admin, faculty, student, outsider };
  }

  it("requires admin authorization for faculty", async function () {
    const { c, outsider } = await setup();
    await expect(c.connect(outsider).authorizeFaculty(outsider.address)).to.be.reverted;
  });

  it("prevents unauthorized enrollment", async function () {
    const { c, outsider } = await setup();
    await c.connect(outsider).registerStudent();
    await expect(c.connect(outsider).enroll(1)).to.be.reverted;
  });

  it("records attendance once and calculates eligibility", async function () {
    const { c, faculty, student } = await setup();
    await c.connect(faculty).startSession(1, 15);
    await c.connect(student).markAttendance(1);
    await expect(c.connect(student).markAttendance(1)).to.be.reverted;
    const result = await c.getStudentStats(1, student.address);
    expect(result.attended).to.equal(1n);
    expect(result.total).to.equal(1n);
    expect(result.percentage).to.equal(100n);
    expect(result.eligible).to.equal(true);
  });

  it("prevents non-owner faculty from starting a course session", async function () {
    const { c, outsider } = await setup();
    await c.authorizeFaculty(outsider.address);
    await expect(c.connect(outsider).startSession(1, 15)).to.be.reverted;
  });

  it("lets only course faculty change the threshold", async function () {
    const { c, faculty, student } = await setup();
    await expect(c.connect(student).setThreshold(1, 60)).to.be.reverted;
    await c.connect(faculty).setThreshold(1, 60);
    expect((await c.getCourse(1)).threshold).to.equal(60n);
  });

  it("rejects attendance after session expiry", async function () {
    const { c, faculty, student } = await setup();
    await c.connect(faculty).startSession(1, 1);
    await ethers.provider.send("evm_increaseTime", [61]);
    await ethers.provider.send("evm_mine", []);
    await expect(c.connect(student).markAttendance(1)).to.be.reverted;
  });
});
