import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { VpcDesignStack } from '../lib/vpc-design-stack';
import { AlbNlbStack } from '../lib/alb-nlb-stack';
import { AutoScalingStack } from '../lib/autoscaling-stack';

// ============================================================================
// ネットワーク & ロードバランシング テストスイート
// ============================================================================
// CDKのテストでは、合成されたCloudFormationテンプレートに対して
// アサーションを行う。実際のAWSリソースは作成されない。
//
// Template.fromStack() でスタックからテンプレートを取得し、
// hasResourceProperties() で特定のプロパティを持つリソースの存在を検証する。
// resourceCountIs() でリソースの数を検証する。
// ============================================================================

describe('VpcDesignStack', () => {
  let app: cdk.App;
  let stack: VpcDesignStack;
  let template: Template;

  beforeEach(() => {
    app = new cdk.App();
    stack = new VpcDesignStack(app, 'TestVpcStack');
    template = Template.fromStack(stack);
  });

  test('VPCが正しいCIDRで作成される', () => {
    // VPCリソースが10.0.0.0/16のCIDRで作成されることを検証
    template.hasResourceProperties('AWS::EC2::VPC', {
      CidrBlock: '10.0.0.0/16',
      EnableDnsHostnames: true,
      EnableDnsSupport: true,
    });
  });

  test('3種類のサブネットが2AZに作成される（合計6サブネット）', () => {
    // 2 AZs × 3 subnet types = 6 subnets
    template.resourceCountIs('AWS::EC2::Subnet', 6);
  });

  test('パブリックサブネットにはインターネットゲートウェイへのルートがある', () => {
    // インターネットゲートウェイが作成される
    template.resourceCountIs('AWS::EC2::InternetGateway', 1);
  });

  test('NATゲートウェイが2つ作成される（AZごとに1つ）', () => {
    // 高可用性のため、各AZにNATゲートウェイが1つずつ配置される
    template.resourceCountIs('AWS::EC2::NatGateway', 2);
  });

  test('VPC Flow Logsが設定される', () => {
    // Flow Logリソースが存在することを検証
    template.hasResourceProperties('AWS::EC2::FlowLog', {
      TrafficType: 'ALL',
    });
  });

  test('CloudWatch LogsのFlow Log用ロググループが14日保持で作成される', () => {
    template.hasResourceProperties('AWS::Logs::LogGroup', {
      RetentionInDays: 14,
    });
  });

  test('S3ゲートウェイエンドポイントが作成される', () => {
    template.hasResourceProperties('AWS::EC2::VPCEndpoint', {
      ServiceName: Match.objectLike({
        'Fn::Join': Match.anyValue(),
      }),
      VpcEndpointType: 'Gateway',
    });
  });

  test('SSMインターフェースエンドポイントが作成される', () => {
    // インターフェースエンドポイント（PrivateLink）が作成される
    // SSM、SSM Messages、EC2 Messagesの3つ
    template.resourcePropertiesCountIs('AWS::EC2::VPCEndpoint', {
      VpcEndpointType: 'Interface',
      PrivateDnsEnabled: true,
    }, 3);
  });

  test('VPC IDのCfnOutputが存在する', () => {
    template.hasOutput('VpcId', {
      Export: {
        Name: 'NetworkingVpcId',
      },
    });
  });
});

describe('AlbNlbStack', () => {
  let app: cdk.App;
  let vpcStack: VpcDesignStack;
  let albNlbStack: AlbNlbStack;
  let template: Template;

  beforeEach(() => {
    app = new cdk.App();
    vpcStack = new VpcDesignStack(app, 'TestVpcStack2');
    albNlbStack = new AlbNlbStack(app, 'TestAlbNlbStack', {
      vpc: vpcStack.vpc,
    });
    template = Template.fromStack(albNlbStack);
  });

  test('ALBがインターネット向けで作成される', () => {
    template.hasResourceProperties('AWS::ElasticLoadBalancingV2::LoadBalancer', {
      Scheme: 'internet-facing',
      Type: 'application',
    });
  });

  test('NLBがインターネット向けで作成される', () => {
    template.hasResourceProperties('AWS::ElasticLoadBalancingV2::LoadBalancer', {
      Scheme: 'internet-facing',
      Type: 'network',
    });
  });

  test('ALBのHTTPリスナーが作成される', () => {
    template.hasResourceProperties('AWS::ElasticLoadBalancingV2::Listener', {
      Port: 80,
      Protocol: 'HTTP',
    });
  });

  test('ターゲットグループにヘルスチェックが設定される', () => {
    template.hasResourceProperties('AWS::ElasticLoadBalancingV2::TargetGroup', {
      HealthCheckPath: '/health',
      HealthCheckIntervalSeconds: 30,
      HealthCheckTimeoutSeconds: 5,
      HealthyThresholdCount: 2,
      UnhealthyThresholdCount: 3,
      Port: 80,
      Protocol: 'HTTP',
    });
  });

  test('リスナールールが作成される（パスベースルーティング）', () => {
    // /api/* と /health のルーティングルール
    template.resourceCountIs('AWS::ElasticLoadBalancingV2::ListenerRule', 2);
  });

  test('ALB DNS名のCfnOutputが存在する', () => {
    template.hasOutput('AlbDnsName', {
      Export: {
        Name: 'NetworkingAlbDnsName',
      },
    });
  });

  test('NLB DNS名のCfnOutputが存在する', () => {
    template.hasOutput('NlbDnsName', {
      Export: {
        Name: 'NetworkingNlbDnsName',
      },
    });
  });
});

describe('AutoScalingStack', () => {
  let app: cdk.App;
  let vpcStack: VpcDesignStack;
  let albNlbStack: AlbNlbStack;
  let autoScalingStack: AutoScalingStack;
  let template: Template;

  beforeEach(() => {
    app = new cdk.App();
    vpcStack = new VpcDesignStack(app, 'TestVpcStack3');
    albNlbStack = new AlbNlbStack(app, 'TestAlbNlbStack3', {
      vpc: vpcStack.vpc,
    });
    autoScalingStack = new AutoScalingStack(app, 'TestAutoScalingStack', {
      vpc: vpcStack.vpc,
      albTargetGroup: albNlbStack.albTargetGroup,
    });
    template = Template.fromStack(autoScalingStack);
  });

  test('Auto Scaling Groupが正しい容量で作成される', () => {
    template.hasResourceProperties('AWS::AutoScaling::AutoScalingGroup', {
      MinSize: '1',
      MaxSize: '4',
      DesiredCapacity: '2',
    });
  });

  test('起動設定がt3.microで作成される', () => {
    template.hasResourceProperties('AWS::AutoScaling::LaunchConfiguration', {
      InstanceType: 't3.micro',
    });
  });

  test('ターゲット追跡スケーリングポリシーが設定される', () => {
    template.hasResourceProperties('AWS::AutoScaling::ScalingPolicy', {
      PolicyType: 'TargetTrackingScaling',
      TargetTrackingConfiguration: Match.objectLike({
        TargetValue: 70,
      }),
    });
  });

  test('スケジュールスケーリングアクションが作成される', () => {
    // 業務時間のスケールアップとスケールダウンの2つ
    template.resourceCountIs('AWS::AutoScaling::ScheduledAction', 2);
  });

  test('ライフサイクルフックが設定される', () => {
    template.hasResourceProperties('AWS::AutoScaling::LifecycleHook', {
      LifecycleTransition: 'autoscaling:EC2_INSTANCE_LAUNCHING',
      DefaultResult: 'CONTINUE',
      HeartbeatTimeout: 300,
    });
  });

  test('IAMロールにSSMポリシーが付与される', () => {
    template.hasResourceProperties('AWS::IAM::Role', {
      ManagedPolicyArns: Match.arrayWith([
        Match.objectLike({
          'Fn::Join': Match.arrayWith([
            Match.arrayWith([
              Match.stringLikeRegexp('AmazonSSMManagedInstanceCore'),
            ]),
          ]),
        }),
      ]),
    });
  });

  test('ASG名のCfnOutputが存在する', () => {
    template.hasOutput('AsgName', {
      Export: {
        Name: 'NetworkingAsgName',
      },
    });
  });
});
