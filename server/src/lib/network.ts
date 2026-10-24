import { BlockList, isIPv4, isIPv6 } from 'node:net'
import os from 'node:os'
import { AppError } from '../middleware/errorHandler.js'

// Chuẩn hóa địa chỉ client: bỏ tiền tố IPv4-mapped (::ffff:192.168.1.5) và zone id (fe80::1%12)
export function normalizeIp(raw: string | undefined | null): string | null {
  if (!raw) return null
  let ip = raw.split('%')[0]!
  if (ip.startsWith('::ffff:') && isIPv4(ip.slice(7))) ip = ip.slice(7)
  return isIPv4(ip) || isIPv6(ip) ? ip : null
}

// Học sinh "cùng mạng" khi kết nối từ chính máy chủ hoặc từ cùng dải mạng (subnet) với một card mạng của máy chủ.
// Đọc lại card mạng mỗi lần gọi vì máy chủ có thể đổi Wi-Fi/LAN khi đang chạy.
export function isSameNetworkAsServer(rawIp: string | undefined): boolean {
  const ip = normalizeIp(rawIp)
  if (!ip) return false

  const local = new BlockList()
  local.addSubnet('127.0.0.0', 8, 'ipv4')
  local.addAddress('::1', 'ipv6')
  for (const nics of Object.values(os.networkInterfaces())) {
    for (const nic of nics ?? []) {
      if (!nic.cidr) continue
      const [address, prefix] = nic.cidr.split('/')
      local.addSubnet(normalizeIp(address) ?? address!, Number(prefix), nic.family === 'IPv4' ? 'ipv4' : 'ipv6')
    }
  }

  return local.check(ip, isIPv4(ip) ? 'ipv4' : 'ipv6')
}

// Cùng mạng với giáo viên:
// - chạy trên máy trong lớp: học sinh cùng mạng nội bộ với máy chủ;
// - chạy trên cloud (Render): học sinh ra Internet qua cùng IP công khai với giáo viên (chung Wi-Fi/NAT của trường).
//   IPv6 mỗi thiết bị một địa chỉ riêng nên so theo dải /64 của mạng.
export function isSameNetworkAsTeacher(rawStudentIp: string | undefined, rawTeacherIp: string | null): boolean {
  if (isSameNetworkAsServer(rawStudentIp)) return true

  const student = normalizeIp(rawStudentIp)
  const teacher = normalizeIp(rawTeacherIp)
  if (!student || !teacher) return false
  if (isIPv4(student) && isIPv4(teacher)) return student === teacher
  if (isIPv6(student) && isIPv6(teacher)) {
    const network = new BlockList()
    network.addSubnet(teacher, 64, 'ipv6')
    return network.check(student, 'ipv6')
  }
  return false
}

export function networkNotAllowedError() {
  return new AppError(
    403,
    'NETWORK_NOT_ALLOWED',
    'Phòng thi này chỉ nhận học sinh dùng chung mạng với giáo viên. Hãy kết nối vào mạng Wi-Fi/LAN của lớp rồi thử lại.'
  )
}
