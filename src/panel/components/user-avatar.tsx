import { cn } from 'cn'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { avatarGradient, avatarInitials, avatarSeed } from '@/lib/avatar'

export interface AvatarUser {
  username: string
  email?: string | null
  id?: string | null
  /** 预留：用户自填/上传的头像地址；为空时回落到本地生成 */
  avatarUrl?: string | null
}

/**
 * 用户头像：有 avatarUrl 显示图片，否则用本地生成的渐变首字母。
 * 不依赖任何第三方头像服务（Gravatar 在国内网络不可达）。
 */
export function UserAvatar({
  user,
  size = 'default',
  rounded = 'full',
  className
}: {
  user: AvatarUser
  size?: 'sm' | 'default' | 'lg'
  rounded?: 'full' | 'lg'
  className?: string
}) {
  const label = user.username || user.email || '?'
  const radius = rounded === 'lg' ? 'rounded-lg' : 'rounded-full'

  return (
    <Avatar size={size} className={cn(radius, rounded === 'lg' && 'after:rounded-lg', className)}>
      {user.avatarUrl ? (
        <AvatarImage src={user.avatarUrl} alt={label} className={radius} />
      ) : null}
      <AvatarFallback
        className={cn(radius, 'font-medium text-white')}
        style={{ backgroundImage: avatarGradient(avatarSeed(user)) }}
      >
        {avatarInitials(label)}
      </AvatarFallback>
    </Avatar>
  )
}
